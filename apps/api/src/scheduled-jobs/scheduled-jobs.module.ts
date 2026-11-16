import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QueueModule } from "../queue/queue.module";
import { ScheduledJobsController } from "./scheduled-jobs.controller";
import { ScheduledJobsService } from "./scheduled-jobs.service";

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [ScheduledJobsController],
  providers: [ScheduledJobsService],
})
export class ScheduledJobsModule {}
