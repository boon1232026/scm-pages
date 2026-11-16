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
import { TemplatesService } from "./templates.service";
import { upsertTemplateSchema } from "@scm/contracts";

@ApiTags("templates")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query("kind") kind?: "post" | "comment") {
    return this.templates.list(workspaceId!, kind);
  }

  @Post()
  @RequireRole("member")
  create(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodPipe(upsertTemplateSchema))
    body: { name: string; kind: "post" | "comment"; body: string; mediaIds: string[] },
  ) {
    return this.templates.create(workspaceId!, userId, body);
  }

  @Patch(":id")
  @RequireRole("member")
  update(
    @WorkspaceId() workspaceId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(upsertTemplateSchema.partial()))
    body: { name?: string; body?: string; mediaIds?: string[] },
  ) {
    return this.templates.update(workspaceId!, id, body);
  }

  @Delete(":id")
  @RequireRole("member")
  @HttpCode(204)
  remove(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.templates.remove(workspaceId!, id);
  }
}
