import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { MetaClient, MetaApiError } from "../meta/meta.client";
import { TokenCryptoService } from "../meta/crypto.service";
import type { Env } from "../config/env";

interface OAuthState {
  sub: string;
  ws: string;
  purpose: "meta_oauth";
  nonce: string;
}

@Injectable()
export class SocialAccountsService {
  private readonly logger = new Logger(SocialAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaClient,
    private readonly crypto: TokenCryptoService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ---------- OAuth ----------

  startOAuth(userId: string, workspaceId: string, redirectUri?: string) {
    this.assertMetaConfigured();
    const state: OAuthState = {
      sub: userId,
      ws: workspaceId,
      purpose: "meta_oauth",
      nonce: crypto.randomUUID(),
    };
    const signed = this.jwt.sign(state as object, { expiresIn: "10m" });
    const cb = redirectUri ?? this.config.get("META_OAUTH_REDIRECT_URI");
    return { oauthUrl: this.meta.buildOAuthUrl(cb!, signed), state: signed };
  }

  async completeOAuth(code: string, signedState: string) {
    const state = await this.verifyState(signedState);
    const cb = this.config.get("META_OAUTH_REDIRECT_URI")!;
    const short = await this.meta.exchangeCode(code, cb);
    const long = await this.meta.toLongLivedToken(short.access_token);
    const profile = await this.meta.me(long.access_token);

    const expiresAt = long.expires_in
      ? new Date(Date.now() + long.expires_in * 1000)
      : null;

    const account = await this.prisma.$transaction(async (tx) => {
      const acc = await tx.socialAccount.upsert({
        where: {
          workspaceId_provider_providerUserId: {
            workspaceId: state.ws,
            provider: "facebook",
            providerUserId: profile.id,
          },
        },
        create: {
          workspaceId: state.ws,
          provider: "facebook",
          providerUserId: profile.id,
          displayName: profile.name,
          avatarUrl: profile.picture?.data?.url ?? null,
          connectedBy: state.sub,
          status: "active",
          scopes: [],
        },
        update: { status: "active", displayName: profile.name, deletedAt: null },
      });
      // replace the user-level token
      await tx.socialToken.deleteMany({ where: { socialAccountId: acc.id, kind: "user" } });
      await tx.socialToken.create({
        data: {
          socialAccountId: acc.id,
          kind: "user",
          tokenEncrypted: this.crypto.encrypt(long.access_token),
          tokenLast4: long.access_token.slice(-4),
          expiresAt,
          isValid: true,
          lastValidatedAt: new Date(),
        },
      });
      return acc;
    });

    await this.syncPages(account.id);
    return account;
  }

  private async verifyState(signed: string): Promise<OAuthState> {
    try {
      const s = await this.jwt.verifyAsync<OAuthState>(signed);
      if (s.purpose !== "meta_oauth") throw new Error("wrong purpose");
      return s;
    } catch {
      throw new BadRequestException({ code: "OAUTH_STATE_INVALID", message: "Invalid or expired OAuth state" });
    }
  }

  private assertMetaConfigured() {
    if (!this.config.get("META_APP_ID") || !this.config.get("META_APP_SECRET")) {
      throw new ServiceUnavailableException({
        code: "META_OAUTH_FAILED",
        message: "META_APP_ID/META_APP_SECRET not configured on the API",
      });
    }
  }

  // ---------- pages sync ----------

  async syncPages(socialAccountId: string): Promise<{ synced: number }> {
    const account = await this.prisma.socialAccount.findUniqueOrThrow({
      where: { id: socialAccountId },
    });
    const userToken = await this.getUserToken(account.id);

    let pages;
    try {
      pages = await this.meta.listManagedPages(userToken);
    } catch (e) {
      if (e instanceof MetaApiError) {
        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: { status: "expired" },
        });
        throw new BadRequestException({
          code: "META_TOKEN_EXPIRED",
          message: `Facebook token invalid — reconnect the account (${e.message})`,
        });
      }
      throw e;
    }

    const seen = new Set<string>();
    for (const p of pages) {
      seen.add(p.id);
      const page = await this.prisma.socialPage.upsert({
        where: { workspaceId_pageId: { workspaceId: account.workspaceId, pageId: p.id } },
        create: {
          workspaceId: account.workspaceId,
          socialAccountId: account.id,
          provider: "facebook",
          pageId: p.id,
          name: p.name,
          category: p.category ?? null,
          avatarUrl: p.picture?.data?.url ?? null,
          followersCount: p.followers_count ?? null,
          tasks: p.tasks ?? [],
          permissions: p.tasks ?? [],
          tokenStatus: "valid",
          lastSyncedAt: new Date(),
        },
        update: {
          name: p.name,
          category: p.category ?? null,
          avatarUrl: p.picture?.data?.url ?? null,
          followersCount: p.followers_count ?? null,
          tasks: p.tasks ?? [],
          permissions: p.tasks ?? [],
          socialAccountId: account.id,
          tokenStatus: "valid",
          lastSyncedAt: new Date(),
          deletedAt: null,
        },
      });
      await this.prisma.socialToken.deleteMany({
        where: { socialPageId: page.id, kind: "page" },
      });
      await this.prisma.socialToken.create({
        data: {
          socialAccountId: account.id,
          socialPageId: page.id,
          kind: "page",
          tokenEncrypted: this.crypto.encrypt(p.access_token),
          tokenLast4: p.access_token.slice(-4),
          expiresAt: null, // page tokens from a long-lived user token do not expire
          isValid: true,
          lastValidatedAt: new Date(),
        },
      });
    }

    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: { lastSyncedAt: new Date(), status: "active" },
    });
    return { synced: seen.size };
  }

  async getUserToken(socialAccountId: string): Promise<string> {
    const t = await this.prisma.socialToken.findFirst({
      where: { socialAccountId, kind: "user", isValid: true },
      orderBy: { createdAt: "desc" },
    });
    if (!t) throw new NotFoundException({ code: "META_TOKEN_EXPIRED", message: "No valid user token" });
    return this.crypto.decrypt(t.tokenEncrypted);
  }

  async getPageToken(socialPageId: string): Promise<string> {
    const t = await this.prisma.socialToken.findFirst({
      where: { socialPageId, kind: "page", isValid: true },
      orderBy: { createdAt: "desc" },
    });
    if (!t) throw new NotFoundException({ code: "META_TOKEN_EXPIRED", message: "No valid page token" });
    return this.crypto.decrypt(t.tokenEncrypted);
  }

  // ---------- CRUD ----------

  async list(workspaceId: string) {
    const rows = await this.prisma.socialAccount.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((a) => ({
      id: a.id,
      provider: a.provider,
      providerUserId: a.providerUserId,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      status: a.status,
      scopes: a.scopes,
      lastSyncedAt: a.lastSyncedAt,
    }));
  }

  async disconnect(workspaceId: string, id: string) {
    const acc = await this.prisma.socialAccount.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!acc) throw new NotFoundException({ code: "NOT_FOUND", message: "Social account not found" });
    await this.prisma.$transaction([
      this.prisma.socialToken.updateMany({
        where: { socialAccountId: id },
        data: { isValid: false },
      }),
      this.prisma.socialAccount.update({
        where: { id },
        data: { status: "revoked", deletedAt: new Date() },
      }),
      this.prisma.socialPage.updateMany({
        where: { socialAccountId: id },
        data: { isEnabled: false, tokenStatus: "missing" },
      }),
    ]);
  }
}
