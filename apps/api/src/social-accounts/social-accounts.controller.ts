import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { z } from "zod";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, RequireRole, WorkspaceGuard, WorkspaceId } from "../common/workspace.guard";
import { SocialAccountsService } from "./social-accounts.service";
import { ZodPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env";

const metaExchangeSchema = z.object({ code: z.string().min(1), state: z.string().min(1) });

@ApiTags("auth")
@Controller("auth/meta")
export class MetaOAuthController {
  constructor(
    private readonly accounts: SocialAccountsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Authed: returns the Meta OAuth dialog URL + signed state (binds user+workspace, 10m). */
  @Get("start")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  start(@CurrentUser() userId: string, @WorkspaceId() workspaceId: string, @Query("redirectUri") redirectUri?: string) {
    return this.accounts.startOAuth(userId, workspaceId!, redirectUri);
  }

  /** Public: Meta redirects here. Exchanges code, stores tokens, syncs pages, deep-links back to the app. */
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ) {
    const okUrl = this.config.get("DESKTOP_OAUTH_SUCCESS_URL");
    const errUrl = this.config.get("DESKTOP_OAUTH_ERROR_URL");
    if (error) return res.redirect(`${errUrl}?error=${encodeURIComponent(error)}`);
    try {
      const account = await this.accounts.completeOAuth(code, state);
      return res.redirect(`${okUrl}?account=${account.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "oauth_failed";
      return res.redirect(`${errUrl}?error=${encodeURIComponent(msg)}`);
    }
  }

  /** Public: landing page after OAuth — shown when DESKTOP_OAUTH_*_URL points here (dev). */
  @Get("done")
  done(@Res() res: Response) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.send(
      `<!doctype html><meta charset="utf-8"><title>Connected</title>
       <body style="font-family:system-ui;background:#0f1115;color:#e6e9ef;display:grid;place-items:center;height:100vh;margin:0">
       <div style="text-align:center"><h2 id="t">Facebook connected</h2>
       <p style="color:#8b93a3" id="m">You can close this tab and go back to Social Commerce Manager.</p></div>
       <script>var e=new URLSearchParams(location.search).get("error");
       if(e){document.getElementById("t").textContent="Connection failed";
       document.getElementById("m").textContent="Error: "+e+" — go back and press Connect Facebook again."}</script></body>`,
    );
  }

  /** Authed alternative: desktop submits {code,state} instead of the redirect flow. */
  @Post("exchange")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  async exchange(@Body(new ZodPipe(metaExchangeSchema)) body: { code: string; state: string }) {
    const account = await this.accounts.completeOAuth(body.code, body.state);
    return { id: account.id, providerUserId: account.providerUserId, displayName: account.displayName };
  }
}

@ApiTags("social-accounts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RequireRole("admin")
@Controller("social-accounts")
export class SocialAccountsController {
  constructor(private readonly accounts: SocialAccountsService) {}

  @Get()
  @RequireRole("viewer")
  list(@WorkspaceId() workspaceId: string) {
    return this.accounts.list(workspaceId!);
  }

  @Delete(":id")
  @HttpCode(204)
  disconnect(@WorkspaceId() workspaceId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.accounts.disconnect(workspaceId!, id);
  }

  @Post(":id/resync")
  resync(@Param("id", ParseUUIDPipe) id: string) {
    return this.accounts.syncPages(id);
  }
}
