import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequireRole, WorkspaceGuard, WorkspaceId } from "../common/workspace.guard";
import { ZodPipe } from "../common/zod-validation.pipe";
import { MediaService } from "./media.service";
import {
  completeUploadsBatchSchema,
  createUploadSchema,
  createUploadsBatchSchema,
  updateMediaSchema,
  type CreateUploadInput,
} from "@scm/contracts";

@ApiTags("media")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("uploads")
  @RequireRole("member")
  createUpload(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodPipe(createUploadSchema))
    body: { fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; sizeBytes: number; category?: string; productId?: string },
  ) {
    return this.media.createUpload(workspaceId!, userId, body);
  }

  @Post("uploads/batch")
  @RequireRole("member")
  createUploadsBatch(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodPipe(createUploadsBatchSchema)) body: { files: CreateUploadInput[] },
  ) {
    return this.media.createUploadsBatch(workspaceId!, userId, body.files);
  }

  @Post("complete/batch")
  @RequireRole("member")
  completeUploadsBatch(
    @WorkspaceId() workspaceId: string,
    @Body(new ZodPipe(completeUploadsBatchSchema)) body: { mediaIds: string[] },
  ) {
    return this.media.completeUploadsBatch(workspaceId!, body.mediaIds);
  }

  @Post(":id/complete")
  @RequireRole("member")
  complete(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.media.complete(workspaceId!, id);
  }

  @Get()
  list(
    @WorkspaceId() workspaceId: string,
    @Query("category") category?: string,
    @Query("q") search?: string,
    @Query("cursor") cursor?: string,
    @Query("productId") productId?: string,
  ) {
    return this.media.list(workspaceId!, { category, search, cursor, productId });
  }

  @Patch(":id")
  @RequireRole("member")
  update(
    @WorkspaceId() workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateMediaSchema))
    body: { name?: string; category?: string | null; tags?: string[]; productId?: string | null },
  ) {
    return this.media.update(workspaceId!, id, body);
  }

  @Delete(":id")
  @RequireRole("member")
  @HttpCode(204)
  remove(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.media.remove(workspaceId!, id);
  }
}
