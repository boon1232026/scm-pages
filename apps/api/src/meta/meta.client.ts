import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";

export class MetaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly fbCode: number | undefined,
    public readonly fbSubcode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

export interface MeAccountsPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
  followers_count?: number;
  picture?: { data: { url: string } };
}

export interface DebugTokenData {
  is_valid: boolean;
  expires_at?: number;
  scopes?: string[];
  user_id?: string;
  app_id?: string;
}

/** Thin typed wrapper over Meta Graph API. Only this class (and worker) may talk to Meta. */
@Injectable()
export class MetaClient {
  private readonly logger = new Logger(MetaClient.name);
  private readonly base: string;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.base = `https://graph.facebook.com/${config.get("META_GRAPH_API_VERSION")}`;
  }

  get graphVersion(): string {
    return this.config.get("META_GRAPH_API_VERSION");
  }

  buildOAuthUrl(redirectUri: string, state: string): string {
    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "pages_manage_engagement",
      "business_management",
    ].join(",");
    const url = new URL(`https://www.facebook.com/${this.graphVersion}/dialog/oauth`);
    url.searchParams.set("client_id", this.config.get("META_APP_ID") ?? "");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("response_type", "code");
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    return this.get<TokenResponse>("/oauth/access_token", {
      client_id: this.config.get("META_APP_ID") ?? "",
      client_secret: this.config.get("META_APP_SECRET") ?? "",
      redirect_uri: redirectUri,
      code,
    });
  }

  async toLongLivedToken(shortToken: string): Promise<TokenResponse> {
    return this.get<TokenResponse>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: this.config.get("META_APP_ID") ?? "",
      client_secret: this.config.get("META_APP_SECRET") ?? "",
      fb_exchange_token: shortToken,
    });
  }

  async me(userToken: string) {
    return this.get<{ id: string; name: string; picture?: { data: { url: string } } }>("/me", {
      fields: "id,name,picture",
      access_token: userToken,
    });
  }

  async listManagedPages(userToken: string): Promise<MeAccountsPage[]> {
    const out: MeAccountsPage[] = [];
    let url: string | null =
      `${this.base}/me/accounts?fields=id,name,access_token,category,tasks,followers_count,picture&limit=100&access_token=${encodeURIComponent(userToken)}`;
    while (url) {
      const res = await this.raw(url);
      const json = (await res.json()) as { data?: MeAccountsPage[]; paging?: { next?: string }; error?: unknown };
      this.throwIfError(res.status, json);
      out.push(...(json.data ?? []));
      url = json.paging?.next ?? null;
    }
    return out;
  }

  async debugToken(inputToken: string): Promise<DebugTokenData> {
    const appToken = `${this.config.get("META_APP_ID")}|${this.config.get("META_APP_SECRET")}`;
    const res = await this.get<{ data: DebugTokenData }>("/debug_token", {
      input_token: inputToken,
      access_token: appToken,
    });
    return res.data;
  }

  async pageFeed(pageId: string, pageToken: string, limit = 25) {
    const res = await this.get<{ data: { id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string }[] }>(
      `/${pageId}/feed`,
      {
        fields: "id,message,created_time,permalink_url,full_picture",
        limit: String(Math.min(limit, 100)),
        access_token: pageToken,
      },
    );
    return res.data;
  }

  // -------- publishing (used by worker in Phase 4; kept here for one Meta boundary) --------

  async createFeedPost(pageId: string, pageToken: string, params: Record<string, string>) {
    return this.postForm<{ id: string }>(`/${pageId}/feed`, { ...params, access_token: pageToken });
  }

  async uploadPhoto(pageId: string, pageToken: string, imageUrl: string, published: boolean) {
    return this.postForm<{ id: string; post_id?: string }>(`/${pageId}/photos`, {
      url: imageUrl,
      published: String(published),
      access_token: pageToken,
    });
  }

  async createComment(objectId: string, pageToken: string, params: Record<string, string>) {
    return this.postForm<{ id: string }>(`/${objectId}/comments`, {
      ...params,
      access_token: pageToken,
    });
  }

  // -------- internals --------

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await this.raw(url.toString());
    const json = (await res.json()) as T & { error?: unknown };
    this.throwIfError(res.status, json);
    return json;
  }

  private async postForm<T>(path: string, params: Record<string, string>): Promise<T> {
    const res = await fetch(this.base + path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const json = (await res.json()) as T & { error?: unknown };
    this.throwIfError(res.status, json);
    return json;
  }

  private raw(url: string) {
    return fetch(url, { headers: { accept: "application/json" } });
  }

  private throwIfError(status: number, body: { error?: unknown }) {
    const err = body.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    if (err || status >= 400) {
      this.logger.warn(`Meta API error status=${status} code=${err?.code} sub=${err?.error_subcode} msg=${err?.message}`);
      throw new MetaApiError(status, err?.code, err?.error_subcode, err?.message ?? `Meta HTTP ${status}`);
    }
  }
}
