import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QueueModule } from "../queue/queue.module";
import { MediaModule } from "../media/media.module";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";

@Module({
  imports: [AuthModule, QueueModule, MediaModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
