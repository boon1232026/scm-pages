import { Module } from "@nestjs/common";
import { WorkspaceScopedController, WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [WorkspacesController, WorkspaceScopedController],
  providers: [WorkspacesService],
})
export class WorkspacesModule {}
