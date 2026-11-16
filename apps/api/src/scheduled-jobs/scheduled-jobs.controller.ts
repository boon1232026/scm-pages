import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequireRole, WorkspaceGuard, WorkspaceId } from "../common/workspace.guard";
import { ZodPipe } from "../common/zod-validation.pipe";
import { ScheduledJobsService } from "./scheduled-jobs.service";

const rescheduleSchema = z.object({ runAt: z.string().datetime({ offset: true }) });

@ApiTags("scheduled-jobs")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Controller("scheduled-jobs")
export class ScheduledJobsController {
  constructor(private readonly jobs: ScheduledJobsService) {}

  @Get()
  list(
    @WorkspaceId() workspaceId: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.jobs.list(workspaceId!, { status, from, to });
  }

  @Post(":id/cancel")
  @RequireRole("member")
  cancel(@WorkspaceId() workspaceId: string, @CurrentUser() userId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.jobs.cancel(workspaceId!, userId, id);
  }

  @Post(":id/reschedule")
  @RequireRole("member")
  reschedule(
    @WorkspaceId() workspaceId: string,
    @CurrentUser() userId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rescheduleSchema)) body: { runAt: string },
  ) {
    return this.jobs.reschedule(workspaceId!, userId, id, new Date(body.runAt));
  }
}
