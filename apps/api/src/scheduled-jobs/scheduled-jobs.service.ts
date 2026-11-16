import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { ActivityLogService } from "../activity-log/activity-log.service";

@Injectable()
export class ScheduledJobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly log: ActivityLogService,
  ) {}

  async list(workspaceId: string, q?: { status?: string; from?: string; to?: string }) {
    const rows = await this.prisma.scheduledJob.findMany({
      where: {
        workspaceId,
        ...(q?.status && { status: q.status as never }),
        ...(q?.from && { runAt: { gte: new Date(q.from) } }),
        ...(q?.to && { runAt: { lte: new Date(q.to) } }),
      },
      orderBy: { runAt: "asc" },
      take: 200,
    });
    return rows.map((j) => ({
      id: j.id,
      kind: j.kind,
      refId: j.refId,
      runAt: j.runAt.toISOString(),
      timezone: j.timezone,
      status: j.status,
      queueJobId: j.queueJobId,
    }));
  }

  async cancel(workspaceId: string, userId: string, id: string) {
    const job = await this.findInWorkspace(workspaceId, id);
    if (job.status !== "enqueued" && job.status !== "pending") {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: `Cannot cancel job in status '${job.status}'` });
    }
    if (job.queueJobId) await this.queue.cancelJob(job.queueJobId);
    const updated = await this.prisma.scheduledJob.update({
      where: { id: job.id },
      data: { status: "cancelled" },
    });
    await this.markEntityCancelled(job);
    void this.log.log({ workspaceId, actorId: userId, action: "job.cancelled", entityType: "scheduled_job", entityId: id });
    return { id: updated.id, status: updated.status };
  }

  async reschedule(workspaceId: string, userId: string, id: string, runAt: Date) {
    const job = await this.findInWorkspace(workspaceId, id);
    if (runAt.getTime() <= Date.now()) {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "runAt must be in the future" });
    }
    if (job.status !== "enqueued" && job.status !== "pending") {
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: `Cannot reschedule job in status '${job.status}'` });
    }
    // cancel the old queue job and re-enqueue for the new time
    if (job.queueJobId) await this.queue.cancelJob(job.queueJobId);
    const { queueJobId } =
      job.kind === "publish_post"
        ? await this.reEnqueuePost(job, runAt)
        : await this.queue.enqueueComment({ workspaceId, commentId: job.refId, runAt });
    const updated = await this.prisma.scheduledJob.update({
      where: { id: job.id },
      data: { runAt, queueJobId },
    });
    await this.prisma.comment.updateMany({ where: { id: job.refId }, data: { scheduledAt: runAt, status: "scheduled" } });
    void this.log.log({
      workspaceId, actorId: userId, action: "job.rescheduled",
      entityType: "scheduled_job", entityId: id, metadata: { runAt },
    });
    return { id: updated.id, runAt: updated.runAt.toISOString(), status: updated.status };
  }

  private async reEnqueuePost(job: { refId: string; workspaceId: string }, runAt: Date) {
    const pp = await this.prisma.postPage.findUniqueOrThrow({ where: { id: job.refId } });
    await this.prisma.post.updateMany({
      where: { id: pp.postId },
      data: { scheduledAt: runAt, status: "scheduled" },
    });
    return this.queue.enqueuePostPage({
      workspaceId: job.workspaceId,
      postId: pp.postId,
      postPageId: pp.id,
      runAt,
    });
  }

  private async markEntityCancelled(job: { kind: string; refId: string }) {
    if (job.kind === "publish_comment") {
      await this.prisma.comment.updateMany({ where: { id: job.refId, status: { in: ["queued", "scheduled"] } }, data: { status: "failed", lastError: { reason: "cancelled" } } });
    } else if (job.kind === "publish_post") {
      await this.prisma.postPage.updateMany({ where: { id: job.refId, status: { in: ["queued", "publishing"] } }, data: { status: "skipped" } });
    }
  }

  private async findInWorkspace(workspaceId: string, id: string) {
    const job = await this.prisma.scheduledJob.findFirst({ where: { id, workspaceId } });
    if (!job) throw new NotFoundException({ code: "NOT_FOUND", message: "Scheduled job not found" });
    return job;
  }
}
