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

## Phase 3 — Facebook Integration: ⬜ next
## Phase 4–7: ⬜

## Blockers / user actions

1. **Meta App credentials** (`META_APP_ID`, `META_APP_SECRET` in `.env`) — required for Phase 3 real OAuth.
2. Rust toolchain (rustup) — will install when Phase 5 Tauri build starts.
3. Docker Desktop — optional now (local pg/redis running); needed for MinIO/S3 or deploy parity.
