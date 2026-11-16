import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { MetaApiError, MetaClient, TokenCrypto } from "@scm/meta";
import { QUEUE_NAMES } from "./queue-names";
import { PrismaService } from "../prisma.service";
import { JobRecorder } from "../job-recorder.service";
import { META_CLIENT, TOKEN_CRYPTO } from "../meta.factory";

/**
 * Validates stored user tokens via debug_token.
 * - invalid -> account expired + workspace notification
 * - expiring < 7d -> attempt fb_exchange_token refresh
 * Runs on demand (queued by API or a repeatable job added later).
 */
@Processor(QUEUE_NAMES.tokenRefresh)
export class TokenRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenRefreshProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recorder: JobRecorder,
    @Inject(META_CLIENT) private readonly meta: MetaClient,
    @Inject(TOKEN_CRYPTO) private readonly crypto: TokenCrypto,
  ) {
    super();
  }

  async process(job: Job<{ workspaceId?: string }>): Promise<void> {
    const accounts = await this.prisma.socialAccount.findMany({
      where: { status: "active", deletedAt: null, ...(job.data.workspaceId && { workspaceId: job.data.workspaceId }) },
      include: { tokens: { where: { kind: "user", isValid: true } } },
    });

    for (const acc of accounts) {
      const tokenRow = acc.tokens[0];
      if (!tokenRow) continue;
      try {
        const token = this.crypto.decrypt(tokenRow.tokenEncrypted);
        const dbg = await this.meta.debugToken(token);
        if (!dbg.is_valid) {
          await this.prisma.$transaction([
            this.prisma.socialToken.update({ where: { id: tokenRow.id }, data: { isValid: false } }),
            this.prisma.socialAccount.update({ where: { id: acc.id }, data: { status: "expired" } }),
            this.prisma.socialPage.updateMany({ where: { socialAccountId: acc.id }, data: { tokenStatus: "expired" } }),
          ]);
          await this.recorder.notify(
            acc.workspaceId,
            "token.expired",
            "Facebook token expired",
            `Account ${acc.displayName} needs to be reconnected.`,
            { socialAccountId: acc.id },
          );
          continue;
        }
        const expiresAt = dbg.expires_at ? new Date(dbg.expires_at * 1000) : null;
        const sevenDays = Date.now() + 7 * 86_400_000;
        if (expiresAt && expiresAt.getTime() < sevenDays) {
          try {
            const refreshed = await this.meta.toLongLivedToken(token);
            await this.prisma.socialToken.update({
              where: { id: tokenRow.id },
              data: {
                tokenEncrypted: this.crypto.encrypt(refreshed.access_token),
                tokenLast4: refreshed.access_token.slice(-4),
                expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
                lastValidatedAt: new Date(),
              },
            });
            this.logger.log(`refreshed token for account ${acc.id}`);
          } catch (e) {
            this.logger.warn(`refresh failed for account ${acc.id}: ${e}`);
            await this.recorder.notify(
              acc.workspaceId,
              "token.expiring",
              "Facebook token expiring soon",
              `Account ${acc.displayName} token expires ${expiresAt.toISOString()} — reconnect soon.`,
              { socialAccountId: acc.id },
            );
          }
        } else {
          await this.prisma.socialToken.update({
            where: { id: tokenRow.id },
            data: { lastValidatedAt: new Date(), expiresAt },
          });
        }
      } catch (e) {
        if (e instanceof MetaApiError) {
          this.logger.warn(`debug_token failed for ${acc.id}: ${e.message}`);
        } else throw e;
      }
    }
  }
}
