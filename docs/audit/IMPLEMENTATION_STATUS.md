# Implementation Status

Updated: 2026-11-16 · Legend: ✅ done · 🚧 in progress · ⬜ not started · ⚠️ blocked

## Phase 0 — Audit & Planning: ✅

| Deliverable | Status | File |
|---|---|---|
| Repo/env audit | ✅ | docs/audit/PHASE0_AUDIT.md |
| System architecture | ✅ | docs/architecture/SYSTEM_ARCHITECTURE.md |
| Module responsibilities | ✅ | docs/architecture/MODULE_RESPONSIBILITIES.md |
| Development roadmap | ✅ | docs/architecture/DEVELOPMENT_ROADMAP.md |
| Database design | ✅ | docs/database/DATABASE_SCHEMA.md |
| API specification | ✅ | docs/api/API_SPECIFICATION.md |
| Security design | ✅ | docs/security/SECURITY_DESIGN.md |
| Deployment guide | ✅ | docs/deployment/DEPLOYMENT_GUIDE.md |
| Windows build guide | ✅ | docs/deployment/WINDOWS_BUILD_GUIDE.md |

Audit: greenfield repo; Node 22 + pnpm 9 installed user-local; Meta Graph API target **v25.0**.
Note: `@db.Citext` replaced by app-level email lowercasing (embedded Postgres lacks contrib ext).

## Phase 1 — Foundation: ✅

| Item | Status |
|---|---|
| pnpm monorepo (9 projects) | ✅ builds green |
| packages/contracts (zod contract + enums + routes) | ✅ 6 unit tests pass |
| packages/sdk (typed client, all v1 routes) | ✅ |
| apps/api NestJS skeleton (env validation, health, Swagger, throttler, error shape) | ✅ boots, `/api/v1/health` returns db=up |
| apps/worker BullMQ (4 queue processors, stubs) | ✅ boots, consumes Redis |
| apps/desktop Tauri+React shell (12 menus, live health) | ✅ vite build green |
| Prisma schema (23 models) + `init` migration | ✅ applied locally |
| docker-compose (pg16/redis7/minio) + CI + windows-build workflows | ✅ written |

**Local infra without Docker**: Postgres 16.15 (zonky embedded binaries, port 5432, db `scm`/`scm_test`) + Redis 7.2.7 (compiled from source, port 6379) — both running user-local. Docker path remains supported via compose.

## Phase 2 — Backend Core: ✅

| Item | Status | Evidence |
|---|---|---|
| Auth (register/login/refresh rotation/logout) | ✅ | e2e: 9 tests pass |
| Argon2id hashing, JWT 15m, refresh family reuse-detection | ✅ | e2e reuse → 401 |
| Users module (`/users/me` get/patch) | ✅ | e2e |
| Workspaces (list/create/get/update/delete, members, invitations, accept) | ✅ | e2e |
| RBAC `WorkspaceGuard` + `@RequireRole` (owner>admin>member>viewer) | ✅ | e2e viewer→403, owner→201 |
| ActivityLog service + `/activity-logs` | ✅ | implemented; cross-workspace → 403 |
| Swagger `/api/docs`, helmet, throttler (login 10/min) | ✅ | live |
| Uniform error contract `{error:{code,message}}` | ✅ | ApiErrorFilter |

## Phase 3 — Facebook Integration: ✅ (code complete; OAuth untested — no app creds)

| Item | Status | Evidence |
|---|---|---|
| `@scm/meta` shared package (Graph client + token crypto) | ✅ | built; used by api + worker |
| AES-256-GCM token encryption at rest | ✅ | unit test round-trip |
| OAuth start/callback endpoints | ✅ | honest 503 `META_OAUTH_FAILED` without creds |
| Social accounts + page sync + page health | ✅ | live: `synced:0`, empty list, 401 unauth |
| Token status/refresh plumbing | ✅ | `token-refresh` queue exists |

## Phase 4 — Publishing & Comments: ✅ backend (worker verified vs real Meta error path)

| Item | Status | Evidence |
|---|---|---|
| Media module: presigned PUT, finalize, Sharp process, thumb | ✅ | live: PUT 200 → ready 800x600 + thumb |
| Posts: text/photo/multi_photo, per-page rows, per-page overrides | ✅ | e2e 202 + `scheduled_jobs` row |
| Idempotency (idempotencyKey + deterministic BullMQ jobIds) | ✅ | e2e replay → same id; jobIds sanitized |
| Comments: text + image attachment (`attachment_url`) | ✅ | e2e 202 + queue row |
| Queue/worker: BullMQ, exponential backoff, fail-fast on non-retriable | ✅ | live: Meta code 190 → `failed` in 1 attempt |
| Retry/cancel per page; post status aggregation (partial) | ✅ | live retry → re-queued + activity log |
| Scheduler: delayed jobs, cancel, reschedule, `scheduled_jobs` table | ✅ | endpoints live; e2e list |
| Templates + Configurations CRUD (workspace-scoped) | ✅ | e2e |
| E2E suite | ✅ | 13 tests pass (22 total incl. auth) |

Local S3 note: MinIO binaries deprecated (410) → dev uses `npx s3rver` with creds
`S3RVER/S3RVER` (documented in `.env.example`); docker/minio remains the prod path.

## Phase 5 — Desktop Application: ⬜ next
## Phase 6–7: ⬜

## Blockers / user actions

1. **Meta App credentials** (`META_APP_ID`, `META_APP_SECRET` in `.env`) — required to verify
   the OAuth happy path and a real successful publish. Failure path is fully verified.
2. Rust toolchain (rustup) — will install when Phase 5 Tauri build starts.
3. Docker Desktop — optional now (local pg/redis running); needed for MinIO/S3 or deploy parity.
