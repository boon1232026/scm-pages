import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/workspace.guard";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  me(@CurrentUser() userId: string) {
    return this.users.me(userId);
  }

  @Patch("me")
  update(
    @CurrentUser() userId: string,
    @Body() body: { displayName?: string; timezone?: string; locale?: string; avatarUrl?: string },
  ) {
    return this.users.update(userId, body);
  }
}
