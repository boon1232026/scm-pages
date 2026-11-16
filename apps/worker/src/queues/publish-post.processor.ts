import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { QUEUE_NAMES } from "./queue-names";

export interface PublishPostJobData {
  postId: string;
  postPageId: string;
  workspaceId: string;
}

/**
 * Publishes one post to one Facebook page.
 * Implemented in Phase 4: upload media -> /{page}/feed or /photos -> update post_pages status.
 */
@Processor(QUEUE_NAMES.publishPost)
export class PublishPostProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishPostProcessor.name);

  async process(job: Job<PublishPostJobData>): Promise<void> {
    this.logger.warn(
      `publish-post job ${job.id} (postPage=${job.data.postPageId}) received — ` +
        `Meta publishing not yet implemented (Phase 4)`,
    );
    throw new Error("NOT_IMPLEMENTED: Meta publishing lands in Phase 4");
  }
}
