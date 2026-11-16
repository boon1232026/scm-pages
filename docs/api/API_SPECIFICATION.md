# API Specification — Central Backend API v1

Base URL: `{API_URL}/api/v1` · Auth: `Authorization: Bearer <access_token>` · All mutating endpoints accept `Idempotency-Key` header.
Workspace scoping: `X-Workspace-Id` header (validated against membership) — default = user's primary workspace.
Errors: `{ "error": { "code": "STRING_CODE", "message": "...", "details": {...} } }` — codes in `packages/contracts`.

Live docs: Swagger UI at `/api/docs` (OpenAPI JSON at `/api/docs-json`).

## Auth

| Method | Path | Body | → |
|---|---|---|---|
| POST | `/auth/register` | `{email,password,displayName,workspaceName?}` | `201 {user, tokens}` |
| POST | `/auth/login` | `{email,password}` | `200 {user, tokens}` |
| POST | `/auth/refresh` | `{refreshToken}` | `200 {tokens}` (rotated) |
| POST | `/auth/logout` | `{refreshToken}` | `204` |
| GET | `/auth/meta/start` | query `redirectUri` | `200 {oauthUrl,state}` — state signed, 10m TTL |
| GET | `/auth/meta/callback` | Meta redirect (code,state) | `302` → desktop deep link / success page |
| POST | `/auth/meta/exchange` | `{code,state}` | `200 {socialAccount}` — alternative code exchange |

## Users & Workspaces

| Method | Path | → |
|---|---|---|
| GET/PATCH | `/users/me` | profile / update (timezone, locale) |
| GET/POST | `/workspaces` | list mine / create |
| GET/PATCH/DELETE | `/workspaces/:id` | manage |
| GET/POST | `/workspaces/:id/members` | list / invite `{email,role}` |
| PATCH/DELETE | `/workspaces/:id/members/:userId` | change role / remove |
| POST | `/workspaces/invitations/:token/accept` | accept invite |

## Social Accounts & Pages

| Method | Path | → |
|---|---|---|
| GET | `/social-accounts` | connected FB identities (no tokens) |
| DELETE | `/social-accounts/:id` | disconnect |
| POST | `/social-accounts/:id/resync` | re-pull pages & permissions |
| GET | `/pages?enabled=&status=` | list pages in workspace |
| POST | `/pages/sync` | sync `/me/accounts` for all accounts → upserts pages |
| PATCH | `/pages/:id` | `{isEnabled}` toggle for publishing |
| GET | `/pages/:id/health` | token validity, scopes, expiry |
| GET | `/pages/:id/feed?limit=` | recent posts on page (for comment target picker) |

## Media

| Method | Path | → |
|---|---|---|
| POST | `/media/uploads` | `{fileName,mimeType,sizeBytes}` → `{uploadUrl,mediaId}` (presigned PUT) |
| POST | `/media/:id/complete` | finalize → enqueue processing (Sharp) |
| GET | `/media?category=&q=&productId=` | list/search |
| PATCH/DELETE | `/media/:id` | rename, categorize, tag / soft delete |

## Posts & Comments

| Method | Path | → |
|---|---|---|
| POST | `/posts` | `{kind,body,pageIds[],mediaIds[],pageOverrides?{pageId:body},scheduledAt?,timezone?,idempotencyKey}` → `202 {post}` |
| GET | `/posts?status=&cursor=` | paged history |
| GET | `/posts/:id` | detail incl. `pages[]` per-page status |
| POST | `/posts/:id/retry` | re-enqueue failed `post_pages` only |
| POST | `/posts/:id/cancel` | cancel scheduled/queued |
| POST | `/comments` | `{pageId,fbTargetId,parentCommentId?,body?,mediaId?,scheduledAt?,idempotencyKey}` → `202 {comment}` |
| GET | `/comments?status=` | history |
| POST | `/comments/:id/retry` `/cancel` | as posts |

## Templates / Campaigns / Configs

| Method | Path | → |
|---|---|---|
| CRUD | `/templates` (`?kind=post|comment`) | template management |
| CRUD | `/campaigns` + `POST /campaigns/:id/run|pause` | batch publishing |
| CRUD | `/configurations` + `GET /configurations/:id` | save/restore composer state |

## Jobs, Logs, Notifications

| Method | Path | → |
|---|---|---|
| GET | `/scheduled-jobs?status=&from=&to=` | scheduler view |
| POST | `/scheduled-jobs/:id/cancel` `/reschedule` | manage |
| GET | `/activity-logs?entityType=&actorId=` | audit |
| GET/PATCH | `/notifications` `/notifications/:id/read` | in-app notifs |

## Status codes

`200` ok · `201` created · `202` accepted (queued) · `204` no content · `400` validation · `401` auth · `403` permission · `404` not found · `409` conflict (duplicate idempotency / slug) · `422` meta capability rejected (e.g. photo comment unsupported) · `429` rate limited · `500` server · `502` meta upstream error
