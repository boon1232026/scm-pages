import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUE_NAMES } from "./queue-names";
import { PublishPostProcessor } from "./publish-post.processor";
import { PublishCommentProcessor } from "./publish-comment.processor";
import { TokenRefreshProcessor } from "./token-refresh.processor";
import { MediaProcessProcessor } from "./media-process.processor";
import { PrismaService } from "../prisma.service";
import { JobRecorder } from "../job-recorder.service";
import { S3Service } from "../s3.service";
import { metaProviders } from "../meta.factory";

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.publishPost },
      { name: QUEUE_NAMES.publishComment },
      { name: QUEUE_NAMES.tokenRefresh },
      { name: QUEUE_NAMES.mediaProcess },
    ),
  ],
  providers: [
    PrismaService,
    JobRecorder,
    S3Service,
    ...metaProviders,
    PublishPostProcessor,
    PublishCommentProcessor,
    TokenRefreshProcessor,
    MediaProcessProcessor,
  ],
})
export class QueuesModule {}
