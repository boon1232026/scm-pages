import { Body, Controller, HttpCode, Ip, Post, Headers } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { ZodPipe } from "../common/zod-validation.pipe";
import { loginSchema, refreshSchema, registerSchema } from "@scm/contracts";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(
    @Body(new ZodPipe(registerSchema))
    body: { email: string; password: string; displayName: string; workspaceName?: string },
  ) {
    return this.auth.register(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  login(
    @Body(new ZodPipe(loginSchema)) body: { email: string; password: string },
    @Ip() ip: string,
    @Headers("user-agent") ua?: string,
  ) {
    return this.auth.login(body, ip, ua);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) body: { refreshToken: string }) {
    await this.auth.logout(body.refreshToken);
  }
}
