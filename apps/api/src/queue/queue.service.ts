import { Injectable, Logger } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";

export const QUEUE_NAMES = {
  publishPost: "publish-post",
  publishComment: "publish-comment",
  mediaProcess: "media-process",
} as const;

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 60_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
};

/** Enqueue side of BullMQ — deterministic jobIds give us dedupe for free. */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.publishPost) private readonly postQueue: Queue,
    @InjectQueue(QUEUE_NAMES.publishComment) private readonly commentQueue: Queue,
    @InjectQueue(QUEUE_NAMES.mediaProcess) private readonly mediaQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /** One BullMQ job per (post,page). `runAt` schedules it; jobId dedupes double submits. */
  async enqueuePostPage(args: {
    workspaceId: string;
    postId: string;
    postPageId: string;
    runAt?: Date | null;
  }): Promise<{ queueJobId: string }> {
    const jobId = `pp-${args.postPageId}`.replace(/:/g, "-");
    const delay = args.runAt ? Math.max(0, args.runAt.getTime() - Date.now()) : 0;
    const job = await this.postQueue.add(
      "publish",
      { postId: args.postId, postPageId: args.postPageId, workspaceId: args.workspaceId },
      { ...JOB_OPTS, jobId, delay },
    );
    this.logger.log(`enqueued publish-post ${jobId} delay=${delay}ms`);
    return { queueJobId: job.id! };
  }

  async enqueueComment(args: {
    workspaceId: string;
    commentId: string;
    runAt?: Date | null;
  }): Promise<{ queueJobId: string }> {
    const jobId = `cm-${args.commentId}`.replace(/:/g, "-");
    const delay = args.runAt ? Math.max(0, args.runAt.getTime() - Date.now()) : 0;
    const job = await this.commentQueue.add(
      "publish",
      { commentId: args.commentId, workspaceId: args.workspaceId },
      { ...JOB_OPTS, jobId, delay },
    );
    return { queueJobId: job.id! };
  }

  /** Remove a queued/delayed job — used by cancel endpoints. Returns false if already running/done. */
  async cancelJob(queueJobId: string): Promise<boolean> {
    for (const q of [this.postQueue, this.commentQueue]) {
      const job = await q.getJob(queueJobId);
      if (job) {
        try {
          await job.remove();
          return true;
        } catch {
          return false; // locked/running
        }
      }
    }
    return false;
  }

  async enqueueMediaProcess(args: { workspaceId: string; mediaId: string }) {
    await this.mediaQueue.add(
      "process",
      { mediaId: args.mediaId, workspaceId: args.workspaceId },
      { ...JOB_OPTS, jobId: `mp-${args.mediaId}`.replace(/:/g, "-") },
    );
  }
}
