import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WorkspaceGuard, WorkspaceId } from "../common/workspace.guard";
import { ActivityLogService } from "./activity-log.service";

@ApiTags("activity-logs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("activity-logs")
export class ActivityLogController {
  constructor(private readonly logs: ActivityLogService) {}

  @Get()
  list(
    @WorkspaceId() workspaceId: string,
    @Query("entityType") entityType?: string,
    @Query("actorId") actorId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.logs.list(workspaceId, { entityType, actorId, limit: limit ? Number(limit) : undefined });
  }
}
