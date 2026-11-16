import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { QUEUE_NAMES } from "./queue-names";

export interface MediaProcessJobData {
  mediaId: string;
  workspaceId: string;
}

/** Phase 4: Sharp validate/resize/compress + thumbnail -> S3 -> media_assets.status=ready. */
@Processor(QUEUE_NAMES.mediaProcess)
export class MediaProcessProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessProcessor.name);

  async process(job: Job<MediaProcessJobData>): Promise<void> {
    this.logger.warn(`media-process job ${job.id} received — not yet implemented (Phase 4)`);
  }
}
