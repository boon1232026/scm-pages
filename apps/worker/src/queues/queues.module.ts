import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { QUEUE_NAMES } from "./queue-names";
import { PublishPostProcessor } from "./publish-post.processor";
import { PublishCommentProcessor } from "./publish-comment.processor";
import { TokenRefreshProcessor } from "./token-refresh.processor";
import { MediaProcessProcessor } from "./media-process.processor";

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
    PublishPostProcessor,
    PublishCommentProcessor,
    TokenRefreshProcessor,
    MediaProcessProcessor,
  ],
})
export class QueuesModule {}
