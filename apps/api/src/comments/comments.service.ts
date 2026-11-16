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
import type { Comment, CreateCommentBatchInput, CreateCommentInput } from "@scm/contracts";

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly media: MediaService,
    private readonly log: ActivityLogService,
  ) {}

  async create(workspaceId: string, userId: string, input: CreateCommentInput): Promise<Comment> {
    if (input.idempotencyKey) {
      const existing = await this.prisma.comment.findFirst({
        where: { workspaceId, idempotencyKey: input.idempotencyKey, deletedAt: null },
      });
      if (existing) return this.toDto(existing);
    }

    const page = await this.prisma.socialPage.findFirst({
      where: { id: input.pageId, workspaceId, deletedAt: null },
    });
    if (!page) throw new NotFoundException({ code: "NOT_FOUND", message: "Page not found" });
    if (!page.isEnabled) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: `Page '${page.name}' is not enabled` });
    }
    if (input.mediaId) await this.media.assertReadyForUse(workspaceId, [input.mediaId]);

    const runAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (runAt && runAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "scheduledAt must be in the future" });
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: {
          workspaceId,
          socialPageId: page.id,
          fbTargetId: input.fbTargetId,
          fbPostId: input.fbPostId ?? null,
          parentCommentId: input.parentCommentId ?? null,
          body: input.body ?? null,
          mediaAssetId: input.mediaId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          status: runAt ? "scheduled" : "queued",
          scheduledAt: runAt,
          createdBy: userId,
        },
      });
      const { queueJobId } = await this.queue.enqueueComment({
        workspaceId,
        commentId: c.id,
        runAt,
      });
      await tx.scheduledJob.create({
        data: {
          workspaceId,
          kind: "publish_comment",
          refId: c.id,
          queueJobId,
          runAt: runAt ?? new Date(),
          status: "enqueued",
          dedupeKey: `comment-${c.id}`,
        },
      });
      return c;
    });

    void this.log.log({
      workspaceId, actorId: userId,
      action: runAt ? "comment.scheduled" : "comment.created",
      entityType: "comment", entityId: comment.id,
      metadata: { pageId: page.id, target: input.fbTargetId, hasMedia: !!input.mediaId },
    });
    return this.toDto(comment);
  }

  /**
   * Batch comments on existing fb objects (old posts / photos). Item i is
   * delayed by i * staggerSeconds; item 0 goes immediately.
   */
  async createBatch(workspaceId: string, userId: string, input: CreateCommentBatchInput) {
    const stagger = input.staggerSeconds ?? 0;
    let created = 0;
    for (const [i, c] of input.comments.entries()) {
      const scheduledAt = i * stagger > 0 ? new Date(Date.now() + i * stagger * 1000).toISOString() : undefined;
      await this.create(workspaceId, userId, {
        ...c,
        ...(scheduledAt ? { scheduledAt } : {}),
        idempotencyKey: input.idempotencyKey
          ? `${input.idempotencyKey}-${i}`
          : (c.idempotencyKey ?? undefined),
      });
      created++;
    }
    return { created };
  }

  async list(workspaceId: string, q?: { status?: string; cursor?: string }) {
    const take = 25;
    const rows = await this.prisma.comment.findMany({
      where: { workspaceId, deletedAt: null, ...(q?.status && { status: q.status as never }) },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(q?.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });
    const nextCursor = rows.length > take ? rows[take - 1]!.id : null;
    return { items: rows.slice(0, take).map(this.toDto), nextCursor };
  }

  async retry(workspaceId: string, userId: string, id: string): Promise<Comment> {
    const c = await this.prisma.comment.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!c) throw new NotFoundException({ code: "NOT_FOUND", message: "Comment not found" });
    if (c.status !== "failed") {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "Only failed comments can be retried" });
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: c.id },
        data: { status: "queued", lastError: Prisma.JsonNull },
      });
      const { queueJobId } = await this.queue.enqueueComment({ workspaceId, commentId: c.id });
      await tx.scheduledJob.create({
        data: {
          workspaceId, kind: "publish_comment", refId: c.id, queueJobId,
          runAt: new Date(), status: "enqueued",
          dedupeKey: `comment-${c.id}-retry-${Date.now()}`,
        },
      });
    });
    void this.log.log({
      workspaceId, actorId: userId, action: "comment.retried",
      entityType: "comment", entityId: c.id,
    });
    return this.toDto((await this.prisma.comment.findUnique({ where: { id: c.id } }))!);
  }

  async cancel(workspaceId: string, userId: string, id: string): Promise<Comment> {
    const c = await this.prisma.comment.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!c) throw new NotFoundException({ code: "NOT_FOUND", message: "Comment not found" });
    if (!["queued", "scheduled"].includes(c.status)) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: `Cannot cancel comment in status '${c.status}'` });
    }
    const job = await this.prisma.scheduledJob.findFirst({
      where: { refId: c.id, status: "enqueued" },
    });
    if (job?.queueJobId) await this.queue.cancelJob(job.queueJobId);
    await this.prisma.$transaction([
      this.prisma.scheduledJob.updateMany({ where: { refId: c.id, status: "enqueued" }, data: { status: "cancelled" } }),
      this.prisma.comment.update({ where: { id: c.id }, data: { status: "failed", lastError: { reason: "cancelled" } } }),
    ]);
    void this.log.log({
      workspaceId, actorId: userId, action: "comment.cancelled",
      entityType: "comment", entityId: c.id,
    });
    return this.toDto((await this.prisma.comment.findUnique({ where: { id: c.id } }))!);
  }

  private toDto(c: {
    id: string; postId: string | null; socialPageId: string; fbTargetId: string; fbPostId: string | null; parentCommentId: string | null;
    body: string | null; mediaAssetId: string | null; fbCommentId: string | null;
    status: string; scheduledAt: Date | null; publishedAt: Date | null;
    lastError: unknown; createdAt: Date;
  }): Comment {
    return {
      id: c.id,
      postId: c.postId,
      socialPageId: c.socialPageId,
      fbTargetId: c.fbTargetId,
      fbPostId: c.fbPostId,
      parentCommentId: c.parentCommentId,
      body: c.body,
      mediaId: c.mediaAssetId,
      fbCommentId: c.fbCommentId,
      status: c.status as Comment["status"],
      scheduledAt: c.scheduledAt?.toISOString() ?? null,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      lastError: c.lastError ? JSON.stringify(c.lastError) : null,
      createdAt: c.createdAt.toISOString(),
    };
  }
}
