import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { MetaApiError, MetaClient, TokenCrypto } from "@scm/meta";
import { QUEUE_NAMES } from "./queue-names";
import { PrismaService } from "../prisma.service";
import { JobRecorder } from "../job-recorder.service";
import { META_CLIENT, TOKEN_CRYPTO } from "../meta.factory";

export interface PublishPostJobData {
  postId: string;
  postPageId: string;
  workspaceId: string;
}

/**
 * Publishes one post to one Facebook page via Meta Graph API.
 * - text        -> POST /{page}/feed {message[, link]}
 * - photo       -> POST /{page}/photos {url, caption, published=true}
 * - multi_photo -> unpublished /photos per image -> /feed with attached_media[i]
 * Idempotent: an already-published post_page is skipped (safe BullMQ retry).
 */
@Processor(QUEUE_NAMES.publishPost)
export class PublishPostProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishPostProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recorder: JobRecorder,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
    @Inject(TOKEN_CRYPTO) private readonly crypto: TokenCrypto,
  ) {
    super();
  }

  async process(job: Job<PublishPostJobData>): Promise<void> {
    const { postPageId, workspaceId } = job.data;
    const { job: scheduledJob, attemptNo } = await this.recorder.attemptStart(job.id);

    const pp = await this.prisma.postPage.findUnique({
      where: { id: postPageId },
      include: {
        socialPage: true,
        post: { include: { media: { include: { mediaAsset: true }, orderBy: { position: "asc" } } } },
      },
    });
    if (!pp || pp.post.workspaceId !== workspaceId) {
      this.logger.warn(`postPage ${postPageId} gone or wrong workspace — dropping job`);
      return;
    }
    if (pp.status === "published") {
      this.logger.log(`postPage ${postPageId} already published — idempotent skip`);
      await this.recorder.attemptSuccess(scheduledJob?.id, attemptNo, { skipped: true });
      return;
    }

    try {
      const tokenRow = await this.prisma.socialToken.findFirst({
        where: { socialPageId: pp.socialPageId, kind: "page", isValid: true },
        orderBy: { createdAt: "desc" },
      });
      if (!tokenRow) throw new Error("No valid page token — reconnect the Facebook account");
      const pageToken = this.crypto.decrypt(tokenRow.tokenEncrypted);
      const pageId = pp.socialPage.pageId;
      const message = pp.bodyOverride ?? pp.post.body;

      let metaResponse: object;
      let fbPostId: string;
      switch (pp.post.kind) {
        case "text": {
          const params: Record<string, string> = { message };
          if (pp.post.linkUrl) params.link = pp.post.linkUrl;
          const r = await this.meta.createFeedPost(pageId, pageToken, params);
          fbPostId = r.id;
          metaResponse = r as object;
          break;
        }
        case "photo": {
          const media = pp.post.media[0]?.mediaAsset;
          if (!media) throw new Error("photo post has no media attached");
          const r = await this.meta.uploadPhoto(pageId, pageToken, media.url, true, message);
          fbPostId = r.post_id ?? r.id;
          metaResponse = r as object;
          break;
        }
        case "multi_photo": {
          const fbids: string[] = [];
          for (const pm of pp.post.media) {
            const up = await this.meta.uploadPhoto(pageId, pageToken, pm.mediaAsset.url, false);
            fbids.push(up.id);
          }
          const params: Record<string, string> = { message };
          fbids.forEach((id, i) => {
            params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
          });
          const r = await this.meta.createFeedPost(pageId, pageToken, params);
          fbPostId = r.id;
          metaResponse = { post: r, uploadedPhotos: fbids };
          break;
        }
        default:
          throw new Error(`unknown post kind '${pp.post.kind}'`);
      }

      await this.prisma.$transaction([
        this.prisma.postPage.update({
          where: { id: pp.id },
          data: {
            status: "published",
            fbPostId,
            publishedAt: new Date(),
            attemptCount: { increment: 1 },
          },
        }),
        this.prisma.socialPage.update({
          where: { id: pp.socialPageId },
          data: { tokenStatus: "valid" },
        }),
      ]);
      await this.recomputePostStatus(pp.postId);
      await this.recorder.attemptSuccess(scheduledJob?.id, attemptNo, metaResponse);
      this.logger.log(`published post ${pp.postId} -> page ${pageId} as ${fbPostId}`);
    } catch (e) {
      const err = this.describeError(e);
      const final = !err.retriable || (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 3);
      await this.prisma.postPage.update({
        where: { id: pp.id },
        data: {
          status: final ? "failed" : "queued",
          lastError: err as object,
          attemptCount: { increment: 1 },
        },
      });
      if (final) {
        await this.recomputePostStatus(pp.postId);
        await this.recorder.notify(
          workspaceId,
          "post.failed",
          "Post failed on a page",
          `${pp.socialPage.name}: ${err.message}`,
          { postId: pp.postId, page: pp.socialPage.name },
        );
      }
      await this.recorder.attemptFailure(scheduledJob?.id, attemptNo, err, final);
      if (!final) throw e; // retriable: let BullMQ run the retry policy
    }
  }

  /** Post status = aggregate of its page results. */
  private async recomputePostStatus(postId: string) {
    const pages = await this.prisma.postPage.findMany({ where: { postId } });
    const statuses = pages.map((p) => p.status);
    let status: "publishing" | "published" | "partial" | "failed" = "publishing";
    if (statuses.every((s) => s === "published")) status = "published";
    else if (statuses.every((s) => s === "failed" || s === "skipped")) status = "failed";
    else if (statuses.some((s) => s === "published" || s === "failed" || s === "skipped")) status = "partial";
    const done = status === "published" || status === "failed" || status === "partial";
    await this.prisma.post.update({
      where: { id: postId },
      data: { status, ...(status === "published" && { publishedAt: new Date() }), ...(done && status === "failed" ? {} : {}) },
    });
  }

  private describeError(e: unknown): { message: string; code?: number; subcode?: number; retriable: boolean } {
    if (e instanceof MetaApiError) {
      // Meta code 32 = page token invalid, 190 = token expired, 368 = temporarily blocked
      const retriable = e.status >= 500 || e.fbCode === 2 || e.fbCode === 4 || e.fbCode === 17;
      return { message: e.message, ...(e.fbCode !== undefined && { code: e.fbCode }), ...(e.fbSubcode !== undefined && { subcode: e.fbSubcode }), retriable };
    }
    return { message: e instanceof Error ? e.message : String(e), retriable: true };
  }
}
