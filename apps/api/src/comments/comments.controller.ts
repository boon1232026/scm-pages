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
import { CommentsService } from "./comments.service";
import { createCommentSchema } from "@scm/contracts";

@ApiTags("comments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("comments")
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Post()
  @HttpCode(202)
  @RequireRole("member")
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodPipe(createCommentSchema)) body: Parameters<CommentsService["create"]>[2],
  ) {
    return this.comments.create(workspaceId!, userId, body);
  }

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query("status") status?: string, @Query("cursor") cursor?: string) {
    return this.comments.list(workspaceId!, { status, cursor });
  }

  @Post(":id/retry")
  @RequireRole("member")
  retry(@WorkspaceId() workspaceId: string, @CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.comments.retry(workspaceId!, userId, id);
  }

  @Post(":id/cancel")
  @RequireRole("member")
  cancel(@WorkspaceId() workspaceId: string, @CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.comments.cancel(workspaceId!, userId, id);
  }
}
