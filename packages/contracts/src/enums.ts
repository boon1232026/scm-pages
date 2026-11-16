export const WorkspaceRole = {
  Owner: "owner",
  Admin: "admin",
  Member: "member",
  Viewer: "viewer",
} as const;
export type WorkspaceRole = (typeof WorkspaceRole)[keyof typeof WorkspaceRole];

export const SocialProvider = { Facebook: "facebook" } as const;
export type SocialProvider = (typeof SocialProvider)[keyof typeof SocialProvider];

export const TokenStatus = {
  Valid: "valid",
  Expiring: "expiring",
  Expired: "expired",
  Missing: "missing",
} as const;
export type TokenStatus = (typeof TokenStatus)[keyof typeof TokenStatus];

export const PostKind = {
  Text: "text",
  Photo: "photo",
  MultiPhoto: "multi_photo",
} as const;
export type PostKind = (typeof PostKind)[keyof typeof PostKind];

export const PostStatus = {
  Draft: "draft",
  Queued: "queued",
  Scheduled: "scheduled",
  Publishing: "publishing",
  Published: "published",
  Partial: "partial",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
export type PostStatus = (typeof PostStatus)[keyof typeof PostStatus];

export const PagePostStatus = {
  Queued: "queued",
  Publishing: "publishing",
  Published: "published",
  Failed: "failed",
  Skipped: "skipped",
} as const;
export type PagePostStatus = (typeof PagePostStatus)[keyof typeof PagePostStatus];

export const CommentStatus = {
  Queued: "queued",
  Scheduled: "scheduled",
  Publishing: "publishing",
  Published: "published",
  Failed: "failed",
} as const;
export type CommentStatus = (typeof CommentStatus)[keyof typeof CommentStatus];

export const JobStatus = {
  Pending: "pending",
  Enqueued: "enqueued",
  Running: "running",
  Done: "done",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JobKind = {
  PublishPost: "publish_post",
  PublishComment: "publish_comment",
  TokenRefresh: "token_refresh",
  MediaProcess: "media_process",
} as const;
export type JobKind = (typeof JobKind)[keyof typeof JobKind];

export const MediaStatus = {
  Processing: "processing",
  Ready: "ready",
  Failed: "failed",
} as const;
export type MediaStatus = (typeof MediaStatus)[keyof typeof MediaStatus];
