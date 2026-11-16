import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QueueModule } from "../queue/queue.module";
import { MediaModule } from "../media/media.module";
import { PostsController } from "./posts.controller";
import { PostsService } from "./posts.service";

@Module({
  imports: [AuthModule, QueueModule, MediaModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
