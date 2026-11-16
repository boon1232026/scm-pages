import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { QUEUE_NAMES } from "./queue-names";

/** Phase 3: refresh long-lived Meta tokens, mark expiring/invalid states. */
@Processor(QUEUE_NAMES.tokenRefresh)
export class TokenRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.warn(`token-refresh job ${job.id} received — not yet implemented (Phase 3)`);
  }
}
