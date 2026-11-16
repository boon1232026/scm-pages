import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthedRequest } from "../auth/jwt-auth.guard";
import type { WorkspaceRole } from "@scm/contracts";

export const REQUIRED_ROLE = "required_role";
const RANK: Record<WorkspaceRole, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };

/** Minimum workspace role for a route: `@RequireRole("member")` */
export const RequireRole = (role: WorkspaceRole) => SetMetadata(REQUIRED_ROLE, role);

/**
 * Resolves the workspace for the request:
 *   X-Workspace-Id header -> must be a workspace the user belongs to
 *   absent -> user's first (primary) membership
 * Attaches req.workspaceId + req.memberRole and enforces @RequireRole.
 * Must run after JwtAuthGuard.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.userId) throw new UnauthorizedException({ code: "UNAUTHORIZED", message: "Unauthenticated" });

    const paramId = (req.params as Record<string, string | undefined>)["workspaceId"];
    const wanted = paramId ?? req.headers["x-workspace-id"];
    const membership = wanted
      ? await this.prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: String(wanted), userId: req.userId } },
        })
      : await this.prisma.workspaceMember.findFirst({
          where: { userId: req.userId, workspace: { deletedAt: null } },
          orderBy: { joinedAt: "asc" },
        });

    if (!membership) {
      throw new ForbiddenException({
        code: "WORKSPACE_ACCESS_DENIED",
        message: wanted ? "Not a member of this workspace" : "User has no workspace",
      });
    }

    const required = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(REQUIRED_ROLE, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && RANK[membership.role] < RANK[required]) {
      throw new ForbiddenException({
        code: "FORBIDDEN",
        message: `Requires workspace role '${required}'`,
      });
    }

    req.workspaceId = membership.workspaceId;
    req.memberRole = membership.role;
    return true;
  }
}

/** Param decorator: `@WorkspaceId() ws: string` */
export const WorkspaceId = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().workspaceId;
});

/** Param decorator: `@CurrentUser() userId: string` */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().userId;
});
