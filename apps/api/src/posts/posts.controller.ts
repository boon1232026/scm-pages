import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequireRole, WorkspaceGuard, WorkspaceId } from "../common/workspace.guard";
import { ZodPipe } from "../common/zod-validation.pipe";
import { PostsService } from "./posts.service";
import { createPostSchema } from "@scm/contracts";

@ApiTags("posts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("posts")
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  @HttpCode(202)
  @RequireRole("member")
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodPipe(createPostSchema)) body: Parameters<PostsService["create"]>[2],
  ) {
    return this.posts.create(workspaceId!, userId, body);
  }

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query("status") status?: string, @Query("cursor") cursor?: string) {
    return this.posts.list(workspaceId!, { status, cursor });
  }

  @Get("capabilities")
  capabilities() {
    return { photoComments: true };
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.posts.get(workspaceId!, id);
  }

  @Post(":id/retry")
  @RequireRole("member")
  retry(@WorkspaceId() workspaceId: string, @CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.posts.retry(workspaceId!, userId, id);
  }

  @Post(":id/cancel")
  @RequireRole("member")
  cancel(@WorkspaceId() workspaceId: string, @CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.posts.cancel(workspaceId!, userId, id);
  }
}
