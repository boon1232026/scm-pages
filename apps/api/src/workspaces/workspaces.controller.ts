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
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequireRole, WorkspaceGuard, WorkspaceId } from "../common/workspace.guard";
import { ZodPipe } from "../common/zod-validation.pipe";
import { WorkspacesService } from "./workspaces.service";
import { createWorkspaceSchema, inviteMemberSchema } from "@scm/contracts";
import { z } from "zod";

const updateRoleSchema = z.object({ role: z.enum(["admin", "member", "viewer"]) });

@ApiTags("workspaces")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.workspaces.listMine(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body(new ZodPipe(createWorkspaceSchema)) body: { name: string }) {
    return this.workspaces.create(userId, body.name);
  }

  @Post("invitations/:token/accept")
  accept(@CurrentUser() userId: string, @Param("token") token: string) {
    return this.workspaces.acceptInvitation(userId, token);
  }
}

@ApiTags("workspaces")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("workspaces/:workspaceId")
export class WorkspaceScopedController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get()
  get(@WorkspaceId() workspaceId: string) {
    return this.workspaces.get(workspaceId);
  }

  @Patch()
  @RequireRole("admin")
  update(@WorkspaceId() workspaceId: string, @Body(new ZodPipe(createWorkspaceSchema)) body: { name: string }) {
    return this.workspaces.update(workspaceId, body.name);
  }

  @Delete()
  @RequireRole("owner")
  @HttpCode(204)
  remove(@WorkspaceId() workspaceId: string) {
    return this.workspaces.remove(workspaceId);
  }

  @Get("members")
  members(@WorkspaceId() workspaceId: string) {
    return this.workspaces.listMembers(workspaceId);
  }

  @Post("members")
  @RequireRole("admin")
  invite(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Body(new ZodPipe(inviteMemberSchema)) body: { email: string; role: "admin" | "member" | "viewer" },
  ) {
    return this.workspaces.invite(workspaceId, userId, body.email, body.role);
  }

  @Patch("members/:userId")
  @RequireRole("admin")
  changeRole(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string,
    @Body(new ZodPipe(updateRoleSchema)) body: { role: "admin" | "member" | "viewer" },
  ) {
    return this.workspaces.changeRole(workspaceId, targetUserId, body.role, userId);
  }

  @Delete("members/:userId")
  @RequireRole("admin")
  @HttpCode(204)
  removeMember(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Param("userId", ParseUUIDPipe) targetUserId: string,
  ) {
    return this.workspaces.removeMember(workspaceId, targetUserId, userId);
  }
}
