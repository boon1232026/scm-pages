import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { QueueService, QUEUE_NAMES } from "./queue.service";
import type { Env } from "../config/env";

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get("REDIS_URL") },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.publishPost },
      { name: QUEUE_NAMES.publishComment },
      { name: QUEUE_NAMES.mediaProcess },
    ),
  ],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
