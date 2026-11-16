import {
  Body,
  Controller,
  Delete,
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
import { ConfigurationsService } from "./configurations.service";
import { saveConfigurationSchema } from "@scm/contracts";

@ApiTags("configurations")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("configurations")
export class ConfigurationsController {
  constructor(private readonly configs: ConfigurationsService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string, @Query("kind") kind?: "post" | "comment" | "campaign") {
    return this.configs.list(workspaceId!, kind);
  }

  @Get(":id")
  get(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.configs.get(workspaceId!, id);
  }

  @Post()
  @RequireRole("member")
  save(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodPipe(saveConfigurationSchema))
    body: { name: string; kind: "post" | "comment" | "campaign"; payload: Record<string, unknown> },
  ) {
    return this.configs.save(workspaceId!, userId, body);
  }

  @Delete(":id")
  @RequireRole("member")
  @HttpCode(204)
  remove(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.configs.remove(workspaceId!, id);
  }
}
