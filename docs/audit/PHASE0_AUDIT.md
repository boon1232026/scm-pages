# PHASE 0 — Repository & Environment Audit

Date: 2026-11-16
Auditor: Devin (AI Software Architect)

## 1. Repository State

| Item | Finding |
|---|---|
| Working directory | `/Users/a007/Documents/บอทFBPage` |
| Existing files | **None — empty directory** (greenfield project) |
| Git | Initialized on `main` |
| Legacy code risk | None — nothing to preserve or migrate |

## 2. Environment Audit (macOS 15.7.9, x86_64)

| Tool | Status | Notes |
|---|---|---|
| Xcode Command Line Tools | ✅ Installed | clang 17 — required for Tauri/Rust builds |
| Git | ✅ 2.39.5 | |
| Node.js | ✅ v22.14.0 | Installed user-local at `~/development/tools/node` (no sudo) |
| pnpm | ✅ 9.15.4 | Via corepack — chosen monorepo package manager |
| Rust / Cargo | ⚠️ Not yet installed | Install via rustup before Tauri build (Phase 5) |
| Docker Desktop | ❌ Not installed | Requires admin install — **user action needed** for local Postgres/Redis |
| PostgreSQL | ❌ Not running locally | Will run via `docker-compose` once Docker is installed |
| Redis | ❌ Not running locally | Same as above |

## 3. External API Verification (checked 2026-11-16)

| Fact | Verified value |
|---|---|
| Latest Meta Graph API version | **v27.0** (released Nov 2026) |
| Target version for this project | **v25.0** (released 2026-02-18, supported until 2028-07-29) — long support window, configurable via env |
| Page post | `POST /{page-id}/feed` (text), `POST /{page-id}/photos` (single photo), multi-photo via unpublished photos + `attached_media` |
| Scheduled post | `scheduled_publish_time` + `published=false` on `/feed` |
| Comment | `POST /{object-id}/comments` with `message`; photo comment via `attachment_url` — **must verify against live page in Phase 4** |
| Required scopes | `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `business_management` (if BM-owned pages) |
| Long-lived token | `GET /oauth/access_token?grant_type=fb_exchange_token` → 60-day user token → never-expiring page token when fetched from long-lived user token |

## 4. Identified Risks & Constraints

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | No Docker Desktop on dev machine | Cannot run Postgres/Redis locally → cannot run integration tests locally | Backend code + Prisma schema still fully developed; DB integration verified once user installs Docker, or via CI services |
| R2 | Meta App Review required for `pages_manage_posts`/`pages_manage_engagement` in production | App works in Dev mode only for pages owned by app admins/testers | Document App Review steps; design works in dev mode immediately |
| R3 | Photo-comment capability changes across API versions | Feature may be limited by Meta | Verify in Phase 4 against real page; degrade gracefully to text comment with image link if blocked |
| R4 | Tauri 2 build requires Rust toolchain | Not installed yet | Install rustup user-local when reaching Phase 5 (no sudo needed) |
| R5 | Windows NSIS build needs Windows runner | Cannot build .exe on macOS | GitHub Actions `windows-latest` runner (spec'd) |
| R6 | HTTPS required by Meta OAuth redirect | Desktop OAuth flow | Use system browser + loopback/custom-scheme redirect handled by backend callback |

## 5. Decisions

1. **Monorepo**: pnpm workspaces (no Turbo initially — keep simple; can add later).
2. **Package manager**: pnpm 9.15.4 pinned via `packageManager` field.
3. **Node**: v22 LTS (`.nvmrc` + `engines` field).
4. **API-first**: All desktop↔backend traffic via versioned REST `/api/v1/*`; shared contracts in `packages/contracts` (Zod schemas + TS types) consumed by generated/typed SDK in `packages/sdk`.
5. **Meta Graph API version**: pinned to `v25.0`, overridable via `META_GRAPH_API_VERSION` env var.
6. **DB**: PostgreSQL 16 + Prisma; Redis 7 + BullMQ for jobs.
7. **Auth**: JWT access (short-lived) + refresh token rotation; Argon2id password hashing; AES-256-GCM encryption at rest for Meta tokens.
