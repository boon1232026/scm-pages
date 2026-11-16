import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { QUEUE_NAMES } from "./queue-names";

export interface PublishCommentJobData {
  commentId: string;
  workspaceId: string;
}

/** Phase 4: POST /{fbTargetId}/comments with message (+ attachment_url when supported). */
@Processor(QUEUE_NAMES.publishComment)
export class PublishCommentProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishCommentProcessor.name);

  async process(job: Job<PublishCommentJobData>): Promise<void> {
    this.logger.warn(`publish-comment job ${job.id} received — not yet implemented (Phase 4)`);
    throw new Error("NOT_IMPLEMENTED: comment publishing lands in Phase 4");
  }
}
