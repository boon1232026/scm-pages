import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import type { Env } from "../config/env";
import { generateRefreshToken, hashToken } from "../common/tokens";
import type { AuthResponse } from "@scm/contracts";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async register(input: {
    email: string;
    password: string;
    displayName: string;
    workspaceName?: string;
  }): Promise<AuthResponse> {
    const email = input.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException({ code: "CONFLICT", message: "Email already registered" });

    const passwordHash = await argon2.hash(input.password);
    const workspaceName = input.workspaceName ?? `${input.displayName}'s workspace`;
    const slug = await this.uniqueSlug(workspaceName);

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, passwordHash, displayName: input.displayName },
      });
      const ws = await tx.workspace.create({
        data: { name: workspaceName, slug, ownerId: u.id },
      });
      await tx.workspaceMember.create({
        data: { workspaceId: ws.id, userId: u.id, role: "owner" },
      });
      return u;
    });

    return this.issueSession(user.id, undefined, undefined);
  }

  async login(input: { email: string; password: string }, ip?: string, ua?: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (!user || user.deletedAt || !user.isActive) {
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueSession(user.id, ip, ua);
  }

  /** Rotate: valid token -> revoke + issue new pair. Reuse of revoked token -> revoke entire family. */
  async refresh(refreshToken: string): Promise<AuthResponse["tokens"]> {
    const hash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    if (!stored) throw new UnauthorizedException({ code: "TOKEN_EXPIRED", message: "Invalid refresh token" });

    if (stored.revokedAt || stored.expiresAt < new Date()) {
      // token reuse or expiry — kill the whole family to stop replay
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: "TOKEN_REUSE_DETECTED",
        message: "Refresh token expired or already used",
      });
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    const next = generateRefreshToken();
    await this.prisma.$transaction([
      this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: next.hash,
          familyId: stored.familyId,
          expiresAt: this.refreshExpiry(),
        },
      }),
    ]);
    return this.makeTokens(user.id, next);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken) },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(userId: string, ip?: string, ua?: string): Promise<AuthResponse> {
    const rt = generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: rt.hash,
        familyId: rt.familyId,
        expiresAt: this.refreshExpiry(),
        createdByIp: ip,
        userAgent: ua,
      },
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        timezone: user.timezone,
        locale: user.locale,
      },
      tokens: this.makeTokens(user.id, rt),
    };
  }

  private makeTokens(userId: string, rt: { token: string }): AuthResponse["tokens"] {
    const expiresIn = this.config.get("JWT_ACCESS_TTL"); // e.g. "15m"
    const accessToken = this.jwt.sign(
      { sub: userId },
      { expiresIn: expiresIn as never },
    );
    const accessTokenExpiresAt = new Date(Date.now() + this.ttlMs(expiresIn)).toISOString();
    return { accessToken, refreshToken: rt.token, accessTokenExpiresAt };
  }

  private ttlMs(ttl: string): number {
    const m = /^(\d+)([smhd])$/.exec(ttl);
    if (!m) return 15 * 60_000;
    const n = Number(m[1]);
    return n * { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as "s"];
  }

  private refreshExpiry(): Date {
    const days = this.config.get("REFRESH_TOKEN_TTL_DAYS");
    return new Date(Date.now() + days * 86_400_000);
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9ก-๙]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace";
    let slug = base;
    for (let i = 2; await this.prisma.workspace.findUnique({ where: { slug } }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }
}
