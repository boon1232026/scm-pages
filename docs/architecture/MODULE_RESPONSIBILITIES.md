# Module Responsibilities — Backend (apps/api)

Each module: `controller` (HTTP boundary), `service` (business logic), `*.repository.ts` (Prisma access), `dto/` (validated by contracts), `*.module.ts`, tests.

| Module | Route prefix (`/api/v1`) | Responsibility | Talks to Meta? |
|---|---|---|---|
| Auth | `/auth` | Register, login, refresh rotation, logout, password reset. Issues JWT. | No |
| Users | `/users` | Profile, preferences (incl. timezone, default `Asia/Bangkok`) | No |
| Workspaces | `/workspaces` | CRUD, members, invitations, role assignment | No |
| Roles & Permissions | (internal) | RBAC guard/decorator, permission matrix | No |
| Social Accounts | `/social-accounts` | Start Meta OAuth, handle callback result, list connected FB identities, disconnect | Yes (OAuth, debug_token) |
| Facebook Pages | `/pages` | List discovered pages, sync pages from Meta, select/enable pages, permission check, token health | Yes (via service) |
| Media | `/media` | Presigned upload → S3, metadata CRUD, categories, search, thumbnail (Sharp) | No |
| Posts | `/posts` | Compose post (text/media/per-page overrides), publish now or schedule, status, retry, history | Enqueues only |
| Comments | `/comments` | Target post selection, text/photo comment, status, history | Enqueues only |
| Templates | `/templates` | Post & comment templates CRUD | No |
| Campaigns | `/campaigns` | Named batch of posts+pages+schedule; run/pause | No |
| Scheduler | `/scheduled-jobs` | List/cancel/reschedule jobs, queue status | No |
| Configurations | `/configurations` | Save/restore named composer state (pages, text, media, schedule) | No |
| Activity Logs | `/activity-logs` | Query audit trail per workspace | No |
| Notifications | `/notifications` | In-app notifications (job done/failed, token expiring) | No |
| Health | `/health` | Liveness/readiness | No |

## Worker (apps/worker) consumers

| Queue | Job | Action |
|---|---|---|
| `publish-post` | `PublishPostJob` | Upload media to Meta → create feed/photos post → update status |
| `publish-comment` | `PublishCommentJob` | POST comment (message / attachment_url) → update status |
| `token-refresh` | `RefreshTokenJob` | Refresh long-lived tokens, mark pages needing reconnect |
| `media-process` | `ProcessMediaJob` | Sharp: validate, resize/compress, thumbnail → S3 |

Retry policy: exponential backoff (3 attempts: 1m, 5m, 15m), `job_attempts` row per try, final failure → status `failed` + notification.

## Desktop (apps/desktop) screens → API mapping

| Screen | Primary endpoints |
|---|---|
| Dashboard | `/posts?recent`, `/scheduled-jobs?upcoming`, `/notifications` |
| Facebook Accounts | `/social-accounts`, `/auth/meta/start` |
| Page Management | `/pages`, `/pages/sync`, `/pages/:id/health` |
| Multi-Post | `/posts`, `/media`, `/templates` |
| Comment Manager | `/comments`, `/pages/:id/feed` (target post list) |
| Product Library | `/media` |
| Templates | `/templates` |
| Scheduler | `/scheduled-jobs` |
| Campaign Manager | `/campaigns` |
| History | `/posts`, `/comments`, `/activity-logs` |
| Configuration | `/configurations` |
| Settings | `/users/me`, `/workspaces` |
