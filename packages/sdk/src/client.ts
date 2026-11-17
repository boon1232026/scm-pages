import {
  API_PREFIX,
  Routes,
  Headers,
  type ApiError,
  type AuthResponse,
  type CreatePostInput,
  type CreateCommentBatchInput,
  type CreateCommentInput,
  type CreateUploadInput,
  type CompleteUploadsBatchResult,
  type SocialAccount,
  type SocialPage,
  type PageHealth,
  type FbFeedPost,
  type FbComment,
  type FbPostPhoto,
  type MediaAsset,
  type UploadTicket,
  type Post,
  type Comment,
  type Template,
  type Configuration,
  type ScheduledJob,
  type AppNotification,
  type Workspace,
  type User,
} from "@scm/contracts";

export interface SdkOptions {
  baseUrl: string;
  getAccessToken: () => string | null;
  getWorkspaceId?: () => string | null;
  /** Called when the API returns 401 — implement refresh + retry here if desired. */
  onUnauthorized?: (failedToken: string | null) => Promise<boolean>;
  fetchImpl?: typeof fetch;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export class SocialCommerceClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: SdkOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "") + API_PREFIX;
    // WKWebView (Tauri) requires fetch to keep its `window` receiver — bind it.
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { query?: Record<string, string | number | boolean | undefined>; retry?: boolean; idempotencyKey?: string },
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts?.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { accept: "application/json" };
    const token = this.opts.getAccessToken();
    if (token) headers[Headers.Authorization] = `Bearer ${token}`;
    const ws = this.opts.getWorkspaceId?.();
    if (ws) headers[Headers.WorkspaceId] = ws;
    if (opts?.idempotencyKey) headers[Headers.IdempotencyKey] = opts.idempotencyKey;
    if (body !== undefined) headers["content-type"] = "application/json";

    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await this.fetchImpl(url, init);

    if (res.status === 401 && opts?.retry !== false && this.opts.onUnauthorized) {
      const recovered = await this.opts.onUnauthorized(token);
      if (recovered) return this.request<T>(method, path, body, { ...opts, retry: false });
    }

    if (!res.ok) {
      let code = "INTERNAL";
      let message = `HTTP ${res.status}`;
      let details: Record<string, unknown> | undefined;
      try {
        const payload = (await res.json()) as ApiError;
        code = payload.error?.code ?? code;
        message = payload.error?.message ?? message;
        details = payload.error?.details;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiRequestError(res.status, code, message, details);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private get<T>(path: string, query?: Record<string, string | number | boolean | undefined>) {
    const opts: { query?: Record<string, string | number | boolean | undefined> } = {};
    if (query) opts.query = query;
    return this.request<T>("GET", path, undefined, opts);
  }
  private post<T>(path: string, body?: unknown, idempotencyKey?: string) {
    const opts: { idempotencyKey?: string } = {};
    if (idempotencyKey) opts.idempotencyKey = idempotencyKey;
    return this.request<T>("POST", path, body, opts);
  }
  private patch<T>(path: string, body: unknown) {
    return this.request<T>("PATCH", path, body);
  }
  private del<T>(path: string) {
    return this.request<T>("DELETE", path);
  }

  // ---------- auth ----------
  register = (b: { email: string; password: string; displayName: string; workspaceName?: string }) =>
    this.post<AuthResponse>(Routes.auth.register, b);
  login = (b: { email: string; password: string }) => this.post<AuthResponse>(Routes.auth.login, b);
  refresh = (refreshToken: string) =>
    this.request<{ accessToken: string; refreshToken: string; accessTokenExpiresAt: string }>(
      "POST",
      Routes.auth.refresh,
      { refreshToken },
      { retry: false },
    );
  logout = (refreshToken: string) => this.post<void>(Routes.auth.logout, { refreshToken });
  startMetaOAuth = (redirectUri?: string) =>
    this.get<{ oauthUrl: string; state: string }>(Routes.auth.metaStart, redirectUri ? { redirectUri } : {});
  exchangeMetaCode = (code: string, state: string) =>
    this.post<SocialAccount>(Routes.auth.metaExchange, { code, state });

  // ---------- users / workspaces ----------
  me = () => this.get<User>(Routes.users.me);
  listWorkspaces = () => this.get<Workspace[]>(Routes.workspaces.root);
  createWorkspace = (name: string) => this.post<Workspace>(Routes.workspaces.root, { name });

  // ---------- social accounts & pages ----------
  listSocialAccounts = () => this.get<SocialAccount[]>(Routes.socialAccounts.root);
  disconnectSocialAccount = (id: string) => this.del<void>(Routes.socialAccounts.byId(id));
  resyncSocialAccount = (id: string) => this.post<{ synced: number }>(Routes.socialAccounts.resync(id));
  listPages = (q?: { enabled?: boolean }) =>
    this.get<SocialPage[]>(Routes.pages.root, { enabled: q?.enabled });
  syncPages = () => this.post<{ synced: number }>(Routes.pages.sync);
  setPageEnabled = (id: string, isEnabled: boolean) =>
    this.patch<SocialPage>(Routes.pages.byId(id), { isEnabled });
  pageHealth = (id: string) => this.get<PageHealth>(Routes.pages.health(id));
  pageFeed = (id: string, q?: { limit?: number; cursor?: string }) =>
    this.get<Page<FbFeedPost>>(Routes.pages.feed(id), { limit: q?.limit, cursor: q?.cursor });
  postPhotos = (pageId: string, fbPostId: string) =>
    this.get<{ post: FbFeedPost; photos: FbPostPhoto[] }>(Routes.pages.postPhotos(pageId, fbPostId));
  postComments = (pageId: string, fbPostId: string) =>
    this.get<{ targets: { fbTargetId: string; comments: FbComment[] }[] }>(Routes.pages.postComments(pageId, fbPostId));

  // ---------- media ----------
  createUpload = (b: CreateUploadInput) => this.post<UploadTicket>(Routes.media.uploads, b);
  createUploadsBatch = (files: CreateUploadInput[]) =>
    this.post<{ tickets: UploadTicket[] }>(Routes.media.uploadsBatch, { files });
  completeUpload = (id: string) => this.post<MediaAsset>(Routes.media.complete(id));
  completeUploadsBatch = (mediaIds: string[]) =>
    this.post<CompleteUploadsBatchResult>(Routes.media.completeBatch, { mediaIds });
  listMedia = (q?: { category?: string; search?: string; cursor?: string }) =>
    this.get<Page<MediaAsset>>(Routes.media.root, { category: q?.category, q: q?.search, cursor: q?.cursor });
  updateMedia = (id: string, b: { name?: string; category?: string | null; tags?: string[] }) =>
    this.patch<MediaAsset>(Routes.media.byId(id), b);
  deleteMedia = (id: string) => this.del<void>(Routes.media.byId(id));

  // ---------- posts ----------
  postCapabilities = () => this.get<{ photoComments: boolean }>(`${Routes.posts.root}/capabilities`);
  createPost = (b: CreatePostInput) => this.post<Post>(Routes.posts.root, b, b.idempotencyKey);
  getPost = (id: string) => this.get<Post>(Routes.posts.byId(id));
  listPosts = (q?: { status?: string; cursor?: string }) =>
    this.get<Page<Post>>(Routes.posts.root, { status: q?.status, cursor: q?.cursor });
  retryPost = (id: string) => this.post<Post>(Routes.posts.retry(id));
  cancelPost = (id: string) => this.post<Post>(Routes.posts.cancel(id));

  // ---------- comments ----------
  createComment = (b: CreateCommentInput) =>
    this.post<Comment>(Routes.comments.root, b, b.idempotencyKey);
  createCommentBatch = (b: CreateCommentBatchInput) =>
    this.post<{ created: number }>(Routes.comments.batch, b, b.idempotencyKey);
  listComments = (q?: { status?: string; cursor?: string }) =>
    this.get<Page<Comment>>(Routes.comments.root, { status: q?.status, cursor: q?.cursor });
  retryComment = (id: string) => this.post<Comment>(Routes.comments.retry(id));
  cancelComment = (id: string) => this.post<Comment>(Routes.comments.cancel(id));

  // ---------- templates / configurations ----------
  listTemplates = (kind?: "post" | "comment") =>
    this.get<Template[]>(Routes.templates.root, { kind });
  createTemplate = (b: { name: string; kind: "post" | "comment"; body: string; mediaIds?: string[] }) =>
    this.post<Template>(Routes.templates.root, b);
  deleteTemplate = (id: string) => this.del<void>(Routes.templates.byId(id));

  listConfigurations = (kind?: string) =>
    this.get<Configuration[]>(Routes.configurations.root, { kind });
  saveConfiguration = (b: { name: string; kind: "post" | "comment" | "campaign"; payload: Record<string, unknown> }) =>
    this.post<Configuration>(Routes.configurations.root, b);
  getConfiguration = (id: string) => this.get<Configuration>(Routes.configurations.byId(id));
  deleteConfiguration = (id: string) => this.del<void>(Routes.configurations.byId(id));

  // ---------- jobs / notifications ----------
  listScheduledJobs = (q?: { status?: string }) =>
    this.get<ScheduledJob[]>(Routes.scheduledJobs.root, { status: q?.status });
  cancelScheduledJob = (id: string) => this.post<ScheduledJob>(Routes.scheduledJobs.cancel(id));
  listNotifications = () => this.get<AppNotification[]>(Routes.notifications.root);
  markNotificationRead = (id: string) => this.patch<void>(Routes.notifications.read(id), {});
}
