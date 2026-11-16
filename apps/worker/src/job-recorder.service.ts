import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Records job_attempts and keeps scheduled_jobs/post/comment statuses in sync.
 * One place so processors stay readable.
 */
@Injectable()
export class JobRecorder {
  constructor(private readonly prisma: PrismaService) {}

  async attemptStart(queueJobId: string | undefined) {
    const job = queueJobId
      ? await this.prisma.scheduledJob.findFirst({ where: { queueJobId }, include: { attempts: true } })
      : null;
    if (!job) return { job: null, attemptNo: 1 };
    const attemptNo = (job.attempts.at(-1)?.attemptNo ?? 0) + 1;
    await this.prisma.$transaction([
      this.prisma.jobAttempt.create({
        data: { scheduledJobId: job.id, attemptNo, status: "failed" }, // flipped on success
      }),
      this.prisma.scheduledJob.update({ where: { id: job.id }, data: { status: "running" } }),
    ]);
    return { job, attemptNo };
  }

  async attemptSuccess(scheduledJobId: string | undefined, attemptNo: number, metaResponse?: object) {
    if (!scheduledJobId) return;
    await this.prisma.$transaction([
      this.prisma.jobAttempt.updateMany({
        where: { scheduledJobId, attemptNo },
        data: { status: "success", finishedAt: new Date(), metaResponse: metaResponse ?? undefined },
      }),
      this.prisma.scheduledJob.update({ where: { id: scheduledJobId }, data: { status: "done" } }),
    ]);
  }

  async attemptFailure(scheduledJobId: string | undefined, attemptNo: number, error: object, final: boolean) {
    if (!scheduledJobId) return;
    await this.prisma.$transaction([
      this.prisma.jobAttempt.updateMany({
        where: { scheduledJobId, attemptNo },
        data: { status: "failed", finishedAt: new Date(), error: error as object },
      }),
      this.prisma.scheduledJob.update({
        where: { id: scheduledJobId },
        data: { status: final ? "failed" : "enqueued" },
      }),
    ]);
  }

  async notify(workspaceId: string, kind: string, title: string, body: string, data?: object) {
    await this.prisma.notification.create({
      data: { workspaceId, kind, title, body, data: (data ?? {}) as object },
    });
  }
}
