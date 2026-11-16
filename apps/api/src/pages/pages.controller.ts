import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequireRole, WorkspaceGuard, WorkspaceId } from "../common/workspace.guard";
import { PagesService } from "./pages.service";
import { ZodPipe } from "../common/zod-validation.pipe";
import { updatePageSchema } from "@scm/contracts";

@ApiTags("pages")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("pages")
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query("enabled") enabled?: string) {
    return this.pages.list(workspaceId!, {
      enabled: enabled === undefined ? undefined : enabled === "true",
    });
  }

  @Post("sync")
  @RequireRole("member")
  sync(@WorkspaceId() workspaceId: string) {
    return this.pages.syncAll(workspaceId!);
  }

  @Patch(":id")
  @RequireRole("member")
  setEnabled(
    @WorkspaceId() workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updatePageSchema)) body: { isEnabled: boolean },
  ) {
    return this.pages.setEnabled(workspaceId!, id, body.isEnabled);
  }

  @Get(":id/health")
  health(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.pages.health(workspaceId!, id);
  }

  @Get(":id/feed")
  feed(
    @WorkspaceId() workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
    @Query("cursor") cursor?: string,
  ) {
    return this.pages.feed(workspaceId!, id, limit ?? 25, cursor);
  }

  @Get(":id/posts/:fbPostId/comments")
  postComments(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string, @Param("fbPostId") fbPostId: string) {
    return this.pages.postComments(workspaceId!, id, fbPostId);
  }

  @Get(":id/posts/:fbPostId/photos")
  postPhotos(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string, @Param("fbPostId") fbPostId: string) {
    return this.pages.postPhotos(workspaceId!, id, fbPostId);
  }
}
