import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConfigurationsController } from "./configurations.controller";
import { ConfigurationsService } from "./configurations.service";

@Module({
  imports: [AuthModule],
  controllers: [ConfigurationsController],
  providers: [ConfigurationsService],
})
export class ConfigurationsModule {}
