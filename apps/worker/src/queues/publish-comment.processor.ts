import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { MetaApiError, MetaClient, TokenCrypto } from "@scm/meta";
import { QUEUE_NAMES } from "./queue-names";
import { PrismaService } from "../prisma.service";
import { JobRecorder } from "../job-recorder.service";
import { META_CLIENT, TOKEN_CRYPTO } from "../meta.factory";

export interface PublishCommentJobData {
  commentId: string;
  workspaceId: string;
}

/**
 * Publishes a comment via POST /{fbTargetId}/comments.
 * - text:  { message }
 * - photo: uploads an unpublished page photo first, then comments with
 *   { attachment_id } (renders better in Meta Business Suite); falls back to
 *   { attachment_url } if that path fails.
 */
@Processor(QUEUE_NAMES.publishComment, { concurrency: 4 })
export class PublishCommentProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishCommentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recorder: JobRecorder,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
    @Inject(TOKEN_CRYPTO) private readonly crypto: TokenCrypto,
  ) {
    super();
  }

  async process(job: Job<PublishCommentJobData>): Promise<void> {
    const { commentId, workspaceId } = job.data;
    const { job: scheduledJob, attemptNo } = await this.recorder.attemptStart(job.id);

    const c = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { socialPage: true, mediaAsset: true },
    });
    if (!c || c.workspaceId !== workspaceId) {
      this.logger.warn(`comment ${commentId} gone or wrong workspace — dropping job`);
      return;
    }
    if (c.status === "published") {
      await this.recorder.attemptSuccess(scheduledJob?.id, attemptNo, { skipped: true });
      return;
    }

    try {
      const tokenRow = await this.prisma.socialToken.findFirst({
        where: { socialPageId: c.socialPageId, kind: "page", isValid: true },
        orderBy: { createdAt: "desc" },
      });
      if (!tokenRow) throw new Error("No valid page token — reconnect the Facebook account");
      const pageToken = this.crypto.decrypt(tokenRow.tokenEncrypted);

      const params: Record<string, string> = {};
      if (c.body) params.message = c.body;

      let r: { id: string };
      if (c.mediaAsset) {
        // Prefer attachment_id: upload the image as an unpublished page photo so
        // Meta creates a real photo object (renders better in Meta Business Suite
        // than attachment_url). Fall back to attachment_url if that path fails.
        try {
          const photo = await this.meta.uploadPhoto(c.socialPage.pageId, pageToken, c.mediaAsset.url, false);
          r = await this.meta.createComment(c.fbTargetId, pageToken, { ...params, attachment_id: photo.id });
        } catch (err) {
          this.logger.warn(`attachment_id path failed for ${c.id}, retrying with attachment_url: ${err}`);
          r = await this.meta.createComment(c.fbTargetId, pageToken, { ...params, attachment_url: c.mediaAsset.url });
        }
      } else {
        r = await this.meta.createComment(c.fbTargetId, pageToken, params);
      }
      await this.prisma.comment.update({
        where: { id: c.id },
        data: { status: "published", fbCommentId: r.id, publishedAt: new Date() },
      });
      await this.recorder.attemptSuccess(scheduledJob?.id, attemptNo, r as object);
      this.logger.log(`comment ${c.id} published as ${r.id} on ${c.fbTargetId}`);
    } catch (e) {
      const err = this.describeError(e);
      const final = !err.retriable || (job.attemptsMade ?? 0) + 1 >= (job.opts.attempts ?? 3);
      await this.prisma.comment.update({
        where: { id: c.id },
        data: { status: final ? "failed" : "queued", lastError: err as object },
      });
      if (final) {
        await this.recorder.notify(
          workspaceId,
          "comment.failed",
          "Comment failed",
          `${c.socialPage.name}: ${err.message}`,
          { commentId: c.id },
        );
      }
      await this.recorder.attemptFailure(scheduledJob?.id, attemptNo, err, final);
      if (!final) throw e; // retriable: let BullMQ run the retry policy
    }
  }

  private describeError(e: unknown): { message: string; code?: number; subcode?: number; retriable: boolean } {
    if (e instanceof MetaApiError) {
      const retriable = e.status >= 500 || e.fbCode === 2 || e.fbCode === 4 || e.fbCode === 17;
      return {
        message: e.message,
        ...(e.fbCode !== undefined && { code: e.fbCode }),
        ...(e.fbSubcode !== undefined && { subcode: e.fbSubcode }),
        retriable,
      };
    }
    return { message: e instanceof Error ? e.message : String(e), retriable: true };
  }
}
