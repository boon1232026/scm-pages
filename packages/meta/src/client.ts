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

export interface MetaConfig {
  appId: string;
  appSecret: string;
  graphVersion: string;
}

export interface TokenResponse {
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

export interface PageFeedItem {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
}

export interface PostPhoto {
  /** Facebook object id that accepts comments (photo id for multi-photo posts). */
  fbPhotoId: string;
  imageUrl: string | null;
}

export interface ObjectComment {
  id: string;
  message: string | null;
  createdTime: string | null;
  fromName: string | null;
  imageUrl: string | null;
}

interface GraphAttachment {
  id?: string;
  type?: string;
  media?: { image?: { src?: string } };
  target?: { id?: string };
  subattachments?: { data?: GraphAttachment[]; paging?: { cursors?: { after?: string }; next?: string } };
}

export interface GraphPost {
  id: string;
  post_id?: string;
}

/**
 * Thin typed wrapper over Meta Graph API — the ONLY place that talks to Meta
 * (shared by apps/api and apps/worker).
 */
export class MetaClient {
  private readonly base: string;

  constructor(
    private readonly config: MetaConfig,
    private readonly onError?: (e: MetaApiError) => void,
  ) {
    this.base = `https://graph.facebook.com/${config.graphVersion}`;
  }

  buildOAuthUrl(redirectUri: string, state: string, scopes: string[]): string {
    const url = new URL(`https://www.facebook.com/${this.config.graphVersion}/dialog/oauth`);
    url.searchParams.set("client_id", this.config.appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes.join(","));
    url.searchParams.set("response_type", "code");
    return url.toString();
  }

  exchangeCode(code: string, redirectUri: string): Promise<TokenResponse> {
    return this.get("/oauth/access_token", {
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: redirectUri,
      code,
    });
  }

  toLongLivedToken(shortToken: string): Promise<TokenResponse> {
    return this.get("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: shortToken,
    });
  }

  me(userToken: string) {
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
      const res = await fetch(url, { headers: { accept: "application/json" } });
      const json = (await res.json()) as {
        data?: MeAccountsPage[];
        paging?: { next?: string };
        error?: unknown;
      };
      this.throwIfError(res.status, json);
      out.push(...(json.data ?? []));
      url = json.paging?.next ?? null;
    }
    return out;
  }

  async debugToken(inputToken: string): Promise<DebugTokenData> {
    const res = await this.get<{ data: DebugTokenData }>("/debug_token", {
      input_token: inputToken,
      access_token: `${this.config.appId}|${this.config.appSecret}`,
    });
    return res.data;
  }

  /** Page's own posts (not visitor posts) with cursor pagination. */
  async pageFeed(
    pageId: string,
    pageToken: string,
    limit = 25,
    after?: string,
  ): Promise<{ items: PageFeedItem[]; nextCursor: string | null }> {
    const res = await this.get<{ data: PageFeedItem[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `/${pageId}/posts`,
      {
        fields: "id,message,created_time,permalink_url,full_picture",
        limit: String(Math.min(limit, 100)),
        access_token: pageToken,
        ...(after ? { after } : {}),
      },
    );
    const nextCursor = res.paging?.next ? (res.paging.cursors?.after ?? null) : null;
    return { items: res.data, nextCursor };
  }

  /** Post summary + photos inside it — photo ids usable as comment targets. */
  async postPhotos(
    postId: string,
    pageToken: string,
  ): Promise<{ post: PageFeedItem; photos: PostPhoto[] }> {
    const res = await this.get<PageFeedItem & { attachments?: { data?: GraphAttachment[] } }>(`/${postId}`, {
      fields: "id,message,created_time,permalink_url,full_picture,attachments{id,media,type,target,subattachments.limit(100){media,target,type}}",
      access_token: pageToken,
    });
    const out: PostPhoto[] = [];
    const pushSub = (s: GraphAttachment) => {
      if (s.target?.id) out.push({ fbPhotoId: s.target.id, imageUrl: s.media?.image?.src ?? null });
    };
    for (const att of res.attachments?.data ?? []) {
      const subs = att.subattachments?.data;
      if (subs?.length) {
        subs.forEach(pushSub);
        // subattachments paginates like any connection — fetch remaining pages (>100 photos)
        if (att.subattachments?.paging?.next && att.id) {
          let after = att.subattachments.paging.cursors?.after;
          for (let i = 0; i < 8 && after; i++) {
            const more = await this.get<{ data?: GraphAttachment[]; paging?: { cursors?: { after?: string }; next?: string } }>(
              `/${att.id}/subattachments`,
              { fields: "media,target,type", limit: "100", access_token: pageToken, after },
            );
            (more.data ?? []).forEach(pushSub);
            after = more.paging?.next ? more.paging.cursors?.after : undefined;
          }
        }
      } else if (att.target?.id) {
        pushSub(att);
      }
    }
    const { attachments: _a, ...post } = res;
    return { post, photos: out };
  }

  /** Real comments on any graph object (post or photo) — includes comments made directly on the page. */
  async objectComments(objectId: string, pageToken: string): Promise<ObjectComment[]> {
    const out: ObjectComment[] = [];
    let after: string | undefined;
    for (let i = 0; i < 3; i++) {
      const res = await this.get<{
        data?: Array<{
          id: string;
          message?: string;
          created_time?: string;
          from?: { id: string; name: string };
          attachment?: { media?: { image?: { src?: string } } };
        }>;
        paging?: { cursors?: { after?: string }; next?: string };
      }>(`/${objectId}/comments`, {
        fields: "id,message,created_time,from,attachment{media{image}}",
        limit: "100",
        access_token: pageToken,
        ...(after ? { after } : {}),
      });
      for (const c of res.data ?? []) {
        out.push({
          id: c.id,
          message: c.message ?? null,
          createdTime: c.created_time ?? null,
          fromName: c.from?.name ?? null,
          imageUrl: c.attachment?.media?.image?.src ?? null,
        });
      }
      after = res.paging?.next ? res.paging.cursors?.after : undefined;
      if (!after) break;
    }
    return out;
  }

  // ---------- publishing ----------

  /** Text/link post on a page feed. Params may include message, link, scheduled_publish_time, published. */
  createFeedPost(pageId: string, pageToken: string, params: Record<string, string>): Promise<GraphPost> {
    return this.postForm(`/${pageId}/feed`, { ...params, access_token: pageToken });
  }

  /** Upload a photo by URL. `published=false` returns an id usable in attached_media for multi-photo posts. */
  uploadPhoto(
    pageId: string,
    pageToken: string,
    imageUrl: string,
    published: boolean,
    caption?: string,
  ): Promise<GraphPost> {
    const params: Record<string, string> = {
      url: imageUrl,
      published: String(published),
      access_token: pageToken,
    };
    if (caption) params.caption = caption;
    return this.postForm(`/${pageId}/photos`, params);
  }

  /** Text comment: {message}. Photo comment (when supported): {attachment_url} or {message+attachment_url}. */
  createComment(objectId: string, pageToken: string, params: Record<string, string>): Promise<GraphPost> {
    return this.postForm(`/${objectId}/comments`, { ...params, access_token: pageToken });
  }

  // ---------- internals ----------

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { accept: "application/json" } });
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

  private throwIfError(status: number, body: { error?: unknown }) {
    const err = body.error as { message?: string; code?: number; error_subcode?: number } | undefined;
    if (err || status >= 400) {
      const e = new MetaApiError(status, err?.code, err?.error_subcode, err?.message ?? `Meta HTTP ${status}`);
      this.onError?.(e);
      throw e;
    }
  }
}
