import { z } from "zod";
import { WorkspaceRole, PostKind, SocialProvider } from "./enums.js";

// ---------- shared ----------
export const uuid = z.string().uuid();
export const cursorQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const isoDateTime = z.string().datetime({ offset: true });

export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

// ---------- auth ----------
export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(120),
  workspaceName: z.string().min(1).max(120).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(32) });

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: isoDateTime,
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const userSchema = z.object({
  id: uuid,
  email: z.string().email(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  timezone: z.string(),
  locale: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const authResponseSchema = z.object({
  user: userSchema,
  tokens: authTokensSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

// ---------- workspaces ----------
export const workspaceSchema = z.object({
  id: uuid,
  name: z.string(),
  slug: z.string(),
  role: z.enum([
    WorkspaceRole.Owner,
    WorkspaceRole.Admin,
    WorkspaceRole.Member,
    WorkspaceRole.Viewer,
  ]),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
});
export const updateWorkspaceSchema = createWorkspaceSchema.partial();

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum([WorkspaceRole.Admin, WorkspaceRole.Member, WorkspaceRole.Viewer]),
});

export const memberSchema = z.object({
  userId: uuid,
  email: z.string().email(),
  displayName: z.string(),
  role: z.enum([
    WorkspaceRole.Owner,
    WorkspaceRole.Admin,
    WorkspaceRole.Member,
    WorkspaceRole.Viewer,
  ]),
});
export type Member = z.infer<typeof memberSchema>;

// ---------- social accounts & pages ----------
export const socialAccountSchema = z.object({
  id: uuid,
  provider: z.literal(SocialProvider.Facebook),
  providerUserId: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  status: z.enum(["active", "expired", "revoked"]),
  scopes: z.array(z.string()),
  lastSyncedAt: isoDateTime.nullable(),
});
export type SocialAccount = z.infer<typeof socialAccountSchema>;

export const socialPageSchema = z.object({
  id: uuid,
  pageId: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  followersCount: z.number().int().nullable(),
  isEnabled: z.boolean(),
  tokenStatus: z.enum(["valid", "expiring", "expired", "missing"]),
  tokenExpiresAt: isoDateTime.nullable(),
  socialAccountId: uuid,
});
export type SocialPage = z.infer<typeof socialPageSchema>;

export const updatePageSchema = z.object({ isEnabled: z.boolean() });

export const pageHealthSchema = z.object({
  pageId: uuid,
  tokenStatus: z.enum(["valid", "expiring", "expired", "missing"]),
  tokenExpiresAt: isoDateTime.nullable(),
  scopes: z.array(z.string()),
  canPost: z.boolean(),
  canComment: z.boolean(),
  issues: z.array(z.string()),
});
export type PageHealth = z.infer<typeof pageHealthSchema>;

export const fbFeedPostSchema = z.object({
  id: z.string(),
  message: z.string().nullable(),
  createdTime: z.string(),
  permalinkUrl: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});
export type FbFeedPost = z.infer<typeof fbFeedPostSchema>;

// ---------- media ----------
export const createUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  sizeBytes: z.number().int().min(1).max(10 * 1024 * 1024),
  category: z.string().max(80).optional(),
  productId: uuid.optional(),
});
export type CreateUploadInput = z.infer<typeof createUploadSchema>;
export const createUploadsBatchSchema = z.object({
  files: z.array(createUploadSchema).min(1).max(8),
});
export const completeUploadsBatchSchema = z.object({
  mediaIds: z.array(uuid).min(1).max(8).refine((ids) => new Set(ids).size === ids.length, "duplicate media ID"),
});

export const mediaAssetSchema = z.object({
  id: uuid,
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  kind: z.enum(["image", "video"]),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  name: z.string(),
  category: z.string().nullable(),
  tags: z.array(z.string()),
  status: z.enum(["processing", "ready", "failed"]),
  productId: uuid.nullable(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const uploadTicketSchema = z.object({
  mediaId: uuid,
  uploadUrl: z.string(),
  expiresAt: isoDateTime,
});
export type UploadTicket = z.infer<typeof uploadTicketSchema>;
export type CompleteUploadsBatchResult = {
  results: ({ mediaId: string; asset: MediaAsset; error?: never } | { mediaId: string; error: string; asset?: never })[];
};

export const updateMediaSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.string().max(80).nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  productId: uuid.nullable().optional(),
});

// ---------- posts ----------
export const createPostSchema = z
  .object({
    kind: z.enum([PostKind.Text, PostKind.Photo, PostKind.MultiPhoto]),
    body: z.string().max(63206).default(""),
    pageIds: z.array(uuid).min(1).max(200),
    mediaIds: z.array(uuid).max(10).default([]),
    linkUrl: z.string().url().max(2048).optional(),
    firstComments: z
      .array(
        z
          .object({
            body: z.string().max(8000).optional(),
            mediaId: uuid.optional(),
            targetMediaId: uuid.optional(),
          })
          .refine((v) => v.body || v.mediaId, { message: "each comment requires body or mediaId" }),
      )
      .max(500)
      .optional(),
    pageOverrides: z.record(uuid, z.string().max(63206)).optional(),
    commentDelaySeconds: z.number().int().min(0).max(86400).optional(),
    scheduledAt: isoDateTime.optional(),
    timezone: z.string().default("Asia/Bangkok"),
    idempotencyKey: z.string().min(8).max(120).optional(),
  })
  .refine((v) => (v.kind === "text" ? v.mediaIds.length === 0 : v.mediaIds.length >= 1), {
    message: "mediaIds required for photo posts and forbidden for text posts",
  })
  .refine((v) => (v.kind !== "multi_photo" ? v.mediaIds.length <= 1 : true), {
    message: "photo kind accepts exactly one mediaId",
  })
  .refine((v) => (v.firstComments ?? []).every((c) => !c.targetMediaId || v.mediaIds.includes(c.targetMediaId)), {
    message: "comment targetMediaId must be a photo attached to this post",
  });
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const postPageSchema = z.object({
  socialPageId: uuid,
  pageName: z.string(),
  status: z.enum(["queued", "publishing", "published", "failed", "skipped"]),
  fbPostId: z.string().nullable(),
  photoIds: z.record(z.string()).nullable(),
  bodyOverride: z.string().nullable(),
  attemptCount: z.number().int(),
  lastError: z.string().nullable(),
  publishedAt: isoDateTime.nullable(),
});
export type PostPage = z.infer<typeof postPageSchema>;

export const postSchema = z.object({
  id: uuid,
  kind: z.enum([PostKind.Text, PostKind.Photo, PostKind.MultiPhoto]),
  body: z.string(),
  status: z.enum([
    "draft",
    "queued",
    "scheduled",
    "publishing",
    "published",
    "partial",
    "failed",
    "cancelled",
  ]),
  scheduledAt: isoDateTime.nullable(),
  publishedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
  firstComments: z.array(z.object({
    body: z.string().nullable(),
    mediaId: uuid.nullable(),
    targetMediaId: uuid.nullable().optional(),
  })),
  commentDelaySec: z.number().int().nullable(),
  mediaIds: z.array(uuid),
  pages: z.array(postPageSchema),
});
export type Post = z.infer<typeof postSchema>;

// ---------- comments ----------
const createCommentObject = z.object({
  pageId: uuid,
  fbTargetId: z.string().min(1),
  fbPostId: z.string().optional(),
  parentCommentId: z.string().optional(),
  body: z.string().max(8000).optional(),
  mediaId: uuid.optional(),
  scheduledAt: isoDateTime.optional(),
  idempotencyKey: z.string().min(8).max(120).optional(),
});
export const createCommentSchema = createCommentObject
  .refine((v) => v.body || v.mediaId, { message: "body or mediaId required" });
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const fbPostPhotoSchema = z.object({
  fbPhotoId: z.string(),
  imageUrl: z.string().nullable(),
});
export type FbPostPhoto = z.infer<typeof fbPostPhotoSchema>;

/** A real comment as returned by Graph API on a post or photo. */
export const fbCommentSchema = z.object({
  id: z.string(),
  message: z.string().nullable(),
  createdTime: z.string().nullable(),
  fromName: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type FbComment = z.infer<typeof fbCommentSchema>;

export const createCommentBatchSchema = z.object({
  comments: z
    .array(createCommentObject.omit({ scheduledAt: true }).refine((v) => v.body || v.mediaId, { message: "body or mediaId required" }))
    .min(1)
    .max(500),
  staggerSeconds: z.number().int().min(0).max(3600).default(0),
  idempotencyKey: z.string().min(8).max(120).optional(),
});
export type CreateCommentBatchInput = z.infer<typeof createCommentBatchSchema>;

export const commentSchema = z.object({
  id: uuid,
  postId: uuid.nullable(),
  socialPageId: uuid,
  fbTargetId: z.string(),
  fbPostId: z.string().nullable(),
  parentCommentId: z.string().nullable(),
  body: z.string().nullable(),
  mediaId: uuid.nullable(),
  fbCommentId: z.string().nullable(),
  status: z.enum(["queued", "scheduled", "publishing", "published", "failed"]),
  scheduledAt: isoDateTime.nullable(),
  publishedAt: isoDateTime.nullable(),
  lastError: z.string().nullable(),
  createdAt: isoDateTime,
});
export type Comment = z.infer<typeof commentSchema>;

// ---------- templates / configs ----------
export const upsertTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  kind: z.enum(["post", "comment"]),
  body: z.string().max(63206),
  mediaIds: z.array(uuid).max(10).default([]),
});
export const templateSchema = upsertTemplateSchema.extend({ id: uuid, createdAt: isoDateTime });
export type Template = z.infer<typeof templateSchema>;

export const saveConfigurationSchema = z.object({
  name: z.string().min(1).max(160),
  kind: z.enum(["post", "comment", "campaign"]),
  payload: z.record(z.unknown()),
});
export const configurationSchema = saveConfigurationSchema.extend({
  id: uuid,
  updatedAt: isoDateTime,
});
export type Configuration = z.infer<typeof configurationSchema>;

// ---------- jobs / notifications ----------
export const scheduledJobSchema = z.object({
  id: uuid,
  kind: z.enum(["publish_post", "publish_comment", "token_refresh", "media_process"]),
  refId: uuid,
  runAt: isoDateTime,
  timezone: z.string(),
  queueJobId: z.string().nullable(),
  status: z.enum(["pending", "enqueued", "running", "done", "failed", "cancelled"]),
});
export type ScheduledJob = z.infer<typeof scheduledJobSchema>;

export const notificationSchema = z.object({
  id: uuid,
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  readAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type AppNotification = z.infer<typeof notificationSchema>;
