import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SocialAccountsService } from "../social-accounts/social-accounts.service";
import { MetaClient, MetaApiError } from "../meta/meta.client";
import { TokenCryptoService } from "../meta/crypto.service";
import type { PageHealth, SocialPage } from "@scm/contracts";

const POST_SCOPE = "pages_manage_posts";
const COMMENT_SCOPE = "pages_manage_engagement";

@Injectable()
export class PagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: SocialAccountsService,
    private readonly meta: MetaClient,
    private readonly crypto: TokenCryptoService,
  ) {}

  async list(workspaceId: string, filter?: { enabled?: boolean }) {
    const rows = await this.prisma.socialPage.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        ...(filter?.enabled !== undefined && { isEnabled: filter.enabled }),
      },
      orderBy: { name: "asc" },
    });
    return rows.map(this.toDto);
  }

  async syncAll(workspaceId: string): Promise<{ synced: number }> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { workspaceId, deletedAt: null, status: "active" },
    });
    let total = 0;
    const errors: string[] = [];
    for (const acc of accounts) {
      try {
        total += (await this.accounts.syncPages(acc.id)).synced;
      } catch (e) {
        errors.push(`${acc.displayName}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    if (accounts.length && total === 0 && errors.length) {
      throw new NotFoundException({ code: "META_TOKEN_EXPIRED", message: errors.join("; ") });
    }
    return { synced: total };
  }

  async setEnabled(workspaceId: string, pageUuid: string, isEnabled: boolean): Promise<SocialPage> {
    const page = await this.findInWorkspace(workspaceId, pageUuid);
    const updated = await this.prisma.socialPage.update({
      where: { id: page.id },
      data: { isEnabled },
    });
    return this.toDto(updated);
  }

  /** Live check: validates the stored page token against Meta and reports capabilities. */
  async health(workspaceId: string, pageUuid: string): Promise<PageHealth> {
    const page = await this.findInWorkspace(workspaceId, pageUuid);
    const issues: string[] = [];
    let scopes: string[] = [];
    let expiresAt: Date | null = null;
    let status: PageHealth["tokenStatus"] = "missing";

    try {
      const token = await this.accounts.getPageToken(page.id);
      const dbg = await this.meta.debugToken(token);
      scopes = dbg.scopes ?? [];
      expiresAt = dbg.expires_at ? new Date(dbg.expires_at * 1000) : null;
      if (!dbg.is_valid) {
        status = "expired";
        issues.push("Page token is invalid — resync or reconnect the Facebook account");
      } else {
        const sevenDays = Date.now() + 7 * 86_400_000;
        status = expiresAt && expiresAt.getTime() < sevenDays ? "expiring" : "valid";
        if (expiresAt && expiresAt.getTime() < Date.now()) {
          status = "expired";
          issues.push("Page token expired");
        }
      }
      if (!scopes.includes(POST_SCOPE)) issues.push(`missing scope ${POST_SCOPE}`);
      if (!scopes.includes(COMMENT_SCOPE)) issues.push(`missing scope ${COMMENT_SCOPE}`);
    } catch (e) {
      if (e instanceof NotFoundException) issues.push("No page token stored — run /pages/sync");
      else if (e instanceof MetaApiError) issues.push(`Meta debug_token failed: ${e.message}`);
      else throw e;
    }

    const canPost = status === "valid" && scopes.includes(POST_SCOPE);
    const canComment = status === "valid" && scopes.includes(COMMENT_SCOPE);
    if (status !== page.tokenStatus) {
      await this.prisma.socialPage.update({
        where: { id: page.id },
        data: { tokenStatus: status, tokenExpiresAt: expiresAt },
      });
    }
    return { pageId: page.id, tokenStatus: status, tokenExpiresAt: expiresAt?.toISOString() ?? null, scopes, canPost, canComment, issues };
  }

  /** Recent posts on the page — used by the comment-target picker. */
  async feed(workspaceId: string, pageUuid: string, limit: number) {
    const page = await this.findInWorkspace(workspaceId, pageUuid);
    const token = await this.accounts.getPageToken(page.id);
    const posts = await this.meta.pageFeed(page.pageId, token, limit);
    return posts.map((p) => ({
      id: p.id,
      message: p.message ?? null,
      createdTime: p.created_time,
      permalinkUrl: p.permalink_url ?? null,
      thumbnailUrl: p.full_picture ?? null,
    }));
  }

  async findInWorkspace(workspaceId: string, pageUuid: string) {
    const page = await this.prisma.socialPage.findFirst({
      where: { id: pageUuid, workspaceId, deletedAt: null },
    });
    if (!page) throw new NotFoundException({ code: "NOT_FOUND", message: "Page not found" });
    return page;
  }

  private toDto(p: {
    id: string; pageId: string; name: string; category: string | null; avatarUrl: string | null;
    followersCount: number | null; isEnabled: boolean; tokenStatus: string; tokenExpiresAt: Date | null;
    socialAccountId: string;
  }): SocialPage {
    return {
      id: p.id,
      pageId: p.pageId,
      name: p.name,
      category: p.category,
      avatarUrl: p.avatarUrl,
      followersCount: p.followersCount,
      isEnabled: p.isEnabled,
      tokenStatus: p.tokenStatus as SocialPage["tokenStatus"],
      tokenExpiresAt: p.tokenExpiresAt?.toISOString() ?? null,
      socialAccountId: p.socialAccountId,
    };
  }
}
