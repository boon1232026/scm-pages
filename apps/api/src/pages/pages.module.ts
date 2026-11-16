import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MetaModule } from "../meta/meta.module";
import { SocialAccountsModule } from "../social-accounts/social-accounts.module";
import { PagesController } from "./pages.controller";
import { PagesService } from "./pages.service";

@Module({
  imports: [AuthModule, MetaModule, SocialAccountsModule],
  controllers: [PagesController],
  providers: [PagesService],
})
export class PagesModule {}
