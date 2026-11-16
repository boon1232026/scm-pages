import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export interface AuthedRequest extends Request {
  userId: string;
  workspaceId?: string;
  memberRole?: "owner" | "admin" | "member" | "viewer";
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Missing bearer token" });
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(header.slice(7));
      req.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException({ code: "TOKEN_EXPIRED", message: "Invalid or expired access token" });
    }
  }
}
