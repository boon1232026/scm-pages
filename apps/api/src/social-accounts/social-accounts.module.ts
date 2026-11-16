import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MetaModule } from "../meta/meta.module";
import {
  MetaOAuthController,
  SocialAccountsController,
} from "./social-accounts.controller";
import { SocialAccountsService } from "./social-accounts.service";

@Module({
  imports: [AuthModule, MetaModule],
  controllers: [MetaOAuthController, SocialAccountsController],
  providers: [SocialAccountsService],
  exports: [SocialAccountsService],
})
export class SocialAccountsModule {}
