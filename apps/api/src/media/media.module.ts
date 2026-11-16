import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { QueueModule } from "../queue/queue.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { S3Service } from "./s3.service";

@Module({
  imports: [AuthModule, QueueModule],
  controllers: [MediaController],
  providers: [MediaService, S3Service],
  exports: [MediaService],
})
export class MediaModule {}
