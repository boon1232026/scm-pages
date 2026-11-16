import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { MediaService } from "../media/media.service";
import { ActivityLogService } from "../activity-log/activity-log.service";
import type { CreatePostInput, Post, PostPage } from "@scm/contracts";

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly media: MediaService,
    private readonly log: ActivityLogService,
  ) {}

  async create(workspaceId: string, userId: string, input: CreatePostInput): Promise<Post> {
    // idempotent replay: same key -> return the existing post instead of double-posting
    if (input.idempotencyKey) {
      const existing = await this.prisma.post.findUnique({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: input.idempotencyKey } },
        include: { pages: { include: { socialPage: true } }, media: true },
      });
      if (existing) return this.toDto(existing);
    }

    const runAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (runAt && runAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "scheduledAt must be in the future" });
    }

    const pages = await this.prisma.socialPage.findMany({
      where: { id: { in: input.pageIds }, workspaceId, deletedAt: null },
    });
    if (pages.length !== input.pageIds.length) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "One or more pages not found in workspace" });
    }
    const disabled = pages.filter((p) => !p.isEnabled);
    if (disabled.length) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: `Pages not enabled for publishing: ${disabled.map((p) => p.name).join(", ")}`,
      });
    }
    await this.media.assertReadyForUse(workspaceId, [
      ...input.mediaIds,
      ...(input.firstComments ?? []).flatMap((c) => (c.mediaId ? [c.mediaId] : [])),
    ]);

    const status = runAt ? "scheduled" : "queued";
    const post = await this.prisma.$transaction(async (tx) => {
      const p = await tx.post.create({
        data: {
          workspaceId,
          createdBy: userId,
          kind: input.kind,
          body: input.body,
          linkUrl: input.linkUrl ?? null,
          firstComments: input.firstComments?.length ? input.firstComments : undefined,
          commentDelaySec: input.commentDelaySeconds ?? 0,
          idempotencyKey: input.idempotencyKey ?? null,
          status,
          scheduledAt: runAt,
          media: {
            create: input.mediaIds.map((mediaAssetId, i) => ({ mediaAssetId, position: i })),
          },
          pages: {
            create: input.pageIds.map((socialPageId) => ({
              socialPageId,
              bodyOverride: input.pageOverrides?.[socialPageId] ?? null,
            })),
          },
        },
        include: { pages: { include: { socialPage: true } }, media: true },
      });
      for (const pp of p.pages) {
        const { queueJobId } = await this.queue.enqueuePostPage({
          workspaceId,
          postId: p.id,
          postPageId: pp.id,
          runAt,
        });
        await tx.scheduledJob.create({
          data: {
            workspaceId,
            kind: "publish_post",
            refId: pp.id,
            queueJobId,
            runAt: runAt ?? new Date(),
            timezone: input.timezone,
            status: "enqueued",
            dedupeKey: `post-${p.id}-page-${pp.id}`,
          },
        });
      }
      return p;
    });

    void this.log.log({
      workspaceId,
      actorId: userId,
      action: runAt ? "post.scheduled" : "post.created",
      entityType: "post",
      entityId: post.id,
      metadata: { pages: input.pageIds.length, kind: input.kind, scheduledAt: runAt },
    });
    return this.toDto(post);
  }

  async get(workspaceId: string, id: string): Promise<Post> {
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { pages: { include: { socialPage: true } }, media: true },
    });
    if (!post) throw new NotFoundException({ code: "NOT_FOUND", message: "Post not found" });
    return this.toDto(post);
  }

  async list(workspaceId: string, q?: { status?: string; cursor?: string }) {
    const take = 25;
    const rows = await this.prisma.post.findMany({
      where: { workspaceId, deletedAt: null, ...(q?.status && { status: q.status as never }) },
      include: { pages: { include: { socialPage: true } }, media: true },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(q?.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });
    const nextCursor = rows.length > take ? rows[take - 1]!.id : null;
    return { items: rows.slice(0, take).map((p) => this.toDto(p)), nextCursor };
  }

  /** Re-enqueue only the failed per-page jobs. */
  async retry(workspaceId: string, userId: string, id: string): Promise<Post> {
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { pages: { include: { socialPage: true } }, media: true },
    });
    if (!post) throw new NotFoundException({ code: "NOT_FOUND", message: "Post not found" });

    const failed = post.pages.filter((p) => p.status === "failed");
    if (!failed.length) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "No failed page jobs to retry" });
    }
    for (const pp of failed) {
      await this.prisma.$transaction(async (tx) => {
        await tx.postPage.update({
          where: { id: pp.id },
          data: { status: "queued", lastError: Prisma.JsonNull },
        });
        const { queueJobId } = await this.queue.enqueuePostPage({
          workspaceId,
          postId: post.id,
          postPageId: pp.id,
          jobIdSuffix: `-r${pp.attemptCount}`,
        });
        await tx.scheduledJob.create({
          data: {
            workspaceId,
            kind: "publish_post",
            refId: pp.id,
            queueJobId,
            runAt: new Date(),
            status: "enqueued",
            dedupeKey: `post-${post.id}-page-${pp.id}-retry-${pp.attemptCount}`,
          },
        });
        return queueJobId;
      });
    }
    await this.prisma.post.update({ where: { id: post.id }, data: { status: "queued" } });
    void this.log.log({
      workspaceId, actorId: userId, action: "post.retried",
      entityType: "post", entityId: post.id, metadata: { retried: failed.length },
    });
    return this.get(workspaceId, id);
  }

  async cancel(workspaceId: string, userId: string, id: string): Promise<Post> {
    const post = await this.prisma.post.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { pages: true },
    });
    if (!post) throw new NotFoundException({ code: "NOT_FOUND", message: "Post not found" });
    if (!["queued", "scheduled"].includes(post.status)) {
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: `Cannot cancel a post in status '${post.status}'`,
      });
    }
    const jobs = await this.prisma.scheduledJob.findMany({
      where: { refId: { in: post.pages.map((p) => p.id) }, status: "enqueued" },
    });
    for (const j of jobs) {
      if (j.queueJobId) await this.queue.cancelJob(j.queueJobId);
    }
    await this.prisma.$transaction([
      this.prisma.scheduledJob.updateMany({
        where: { id: { in: jobs.map((j) => j.id) } },
        data: { status: "cancelled" },
      }),
      this.prisma.postPage.updateMany({
        where: { postId: post.id, status: { in: ["queued", "publishing"] } },
        data: { status: "skipped" },
      }),
      this.prisma.post.update({ where: { id: post.id }, data: { status: "cancelled" } }),
    ]);
    void this.log.log({
      workspaceId, actorId: userId, action: "post.cancelled",
      entityType: "post", entityId: post.id,
    });
    return this.get(workspaceId, id);
  }

  private toDto(p: {
    id: string; kind: string; body: string; status: string; scheduledAt: Date | null;
    publishedAt: Date | null; createdAt: Date;
    firstComments: unknown;
    commentDelaySec: number | null;
    media: { mediaAssetId: string; position: number }[];
    pages: ({
      socialPageId: string; bodyOverride: string | null; fbPostId: string | null; photoIds: unknown;
      status: string; attemptCount: number; lastError: unknown; publishedAt: Date | null;
      socialPage: { name: string };
    })[];
  }): Post {
    return {
      id: p.id,
      kind: p.kind as Post["kind"],
      body: p.body,
      status: p.status as Post["status"],
      scheduledAt: p.scheduledAt?.toISOString() ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      firstComments: (p.firstComments as Post["firstComments"] | null) ?? [],
      commentDelaySec: p.commentDelaySec ?? 0,
      mediaIds: [...p.media].sort((a, b) => a.position - b.position).map((m) => m.mediaAssetId),
      pages: p.pages.map(
        (pp): PostPage => ({
          socialPageId: pp.socialPageId,
          pageName: pp.socialPage.name,
          status: pp.status as PostPage["status"],
          fbPostId: pp.fbPostId,
          photoIds: (pp.photoIds as Record<string, string> | null) ?? null,
          bodyOverride: pp.bodyOverride,
          attemptCount: pp.attemptCount,
          lastError: pp.lastError ? JSON.stringify(pp.lastError) : null,
          publishedAt: pp.publishedAt?.toISOString() ?? null,
        }),
      ),
    };
  }
}
