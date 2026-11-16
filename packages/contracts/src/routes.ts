export const API_PREFIX = "/api/v1" as const;

export const Routes = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    refresh: "/auth/refresh",
    logout: "/auth/logout",
    metaStart: "/auth/meta/start",
    metaCallback: "/auth/meta/callback",
    metaExchange: "/auth/meta/exchange",
  },
  users: { me: "/users/me" },
  workspaces: {
    root: "/workspaces",
    byId: (id: string) => `/workspaces/${id}`,
    members: (id: string) => `/workspaces/${id}/members`,
    member: (id: string, userId: string) => `/workspaces/${id}/members/${userId}`,
    acceptInvite: (token: string) => `/workspaces/invitations/${token}/accept`,
  },
  socialAccounts: {
    root: "/social-accounts",
    byId: (id: string) => `/social-accounts/${id}`,
    resync: (id: string) => `/social-accounts/${id}/resync`,
  },
  pages: {
    root: "/pages",
    sync: "/pages/sync",
    byId: (id: string) => `/pages/${id}`,
    health: (id: string) => `/pages/${id}/health`,
    feed: (id: string) => `/pages/${id}/feed`,
    postPhotos: (id: string, fbPostId: string) => `/pages/${id}/posts/${fbPostId}/photos`,
  },
  media: {
    root: "/media",
    uploads: "/media/uploads",
    byId: (id: string) => `/media/${id}`,
    complete: (id: string) => `/media/${id}/complete`,
  },
  posts: {
    root: "/posts",
    byId: (id: string) => `/posts/${id}`,
    retry: (id: string) => `/posts/${id}/retry`,
    cancel: (id: string) => `/posts/${id}/cancel`,
  },
  comments: {
    root: "/comments",
    batch: "/comments/batch",
    byId: (id: string) => `/comments/${id}`,
    retry: (id: string) => `/comments/${id}/retry`,
    cancel: (id: string) => `/comments/${id}/cancel`,
  },
  templates: {
    root: "/templates",
    byId: (id: string) => `/templates/${id}`,
  },
  campaigns: {
    root: "/campaigns",
    byId: (id: string) => `/campaigns/${id}`,
    run: (id: string) => `/campaigns/${id}/run`,
    pause: (id: string) => `/campaigns/${id}/pause`,
  },
  configurations: {
    root: "/configurations",
    byId: (id: string) => `/configurations/${id}`,
  },
  scheduledJobs: {
    root: "/scheduled-jobs",
    byId: (id: string) => `/scheduled-jobs/${id}`,
    cancel: (id: string) => `/scheduled-jobs/${id}/cancel`,
    reschedule: (id: string) => `/scheduled-jobs/${id}/reschedule`,
  },
  activityLogs: { root: "/activity-logs" },
  notifications: {
    root: "/notifications",
    read: (id: string) => `/notifications/${id}/read`,
  },
  health: "/health",
} as const;

export const Headers = {
  Authorization: "authorization",
  WorkspaceId: "x-workspace-id",
  IdempotencyKey: "idempotency-key",
} as const;
