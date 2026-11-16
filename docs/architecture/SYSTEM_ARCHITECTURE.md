# System Architecture — Social Commerce Manager

## 1. Overview

API-first desktop application for managing Facebook Page publishing across multiple pages/workspaces. The Desktop UI is a thin client; **all** business logic, Meta API calls, persistence and scheduling live in the Central Backend API + Worker.

```
┌──────────────────┐        HTTPS REST /api/v1        ┌─────────────────────────┐
│  Desktop App      │  ──────────────────────────────▶ │  Central Backend API     │
│  (Tauri 2 + React │ ◀──────────────────────────────  │  (NestJS, REST, Swagger) │
│   + TypeScript)   │        JSON + typed SDK          │                          │
└──────────────────┘                                    └───────────┬──────────────┘
                                                                    │
              ┌──────────────────┬──────────────────┬───────────────┼───────────────┐
              ▼                  ▼                  ▼               ▼               ▼
        ┌───────────┐     ┌───────────┐      ┌────────────┐  ┌────────────┐  ┌───────────┐
        │ PostgreSQL│     │   Redis   │      │ S3 Object  │  │  Worker    │  │  Meta     │
        │  (Prisma) │     │  (BullMQ) │      │  Storage   │  │  (BullMQ   │  │ Graph API │
        └───────────┘     └───────────┘      └────────────┘  │ consumers) │  │  v25.0    │
                                                             └─────┬──────┘  └─────▲─────┘
                                                                   └───────────────┘
                                                        (only Worker/API talks to Meta)
```

## 2. Applications

| App | Tech | Responsibility |
|---|---|---|
| `apps/desktop` | Tauri 2, React, TS, Vite | Thin client. Renders UI, calls SDK. No business logic, no DB, no direct Meta calls. |
| `apps/api` | NestJS, Prisma, Swagger | Central REST API. AuthN/AuthZ, workspaces, pages, posts, comments, templates, media, scheduler, configs, logs. |
| `apps/worker` | NestJS (standalone), BullMQ | Executes scheduled/queued jobs: publish post, publish comment, token refresh, media processing. Only component besides API that may call Meta. |
| `apps/admin` | React (later phase) | Optional ops console (users, workspaces). Phase 6+. |

## 3. Shared Packages

| Package | Contents |
|---|---|
| `packages/contracts` | Zod schemas, DTO types, API route constants, error codes, domain enums — single source of truth for API contract |
| `packages/sdk` | Typed API client (`SocialCommerceClient`) wrapping fetch — used by desktop & admin |
| `packages/config` | Shared eslint/tsconfig/tailwind presets, env schema |
| `packages/ui` | Shared React primitives (later phase) |

## 4. Request Flow (example: multi-page post)

1. Desktop → `POST /api/v1/posts` (workspace-scoped, idempotency key header).
2. API validates (Zod DTO), checks workspace permission, persists `posts` + `post_pages` rows (status `queued`), enqueues BullMQ job per page, returns `202` + post id.
3. Worker picks job → uploads media to Meta (`/photos`, `published=false`) → creates feed post with `attached_media` → writes `job_attempts`, updates per-page status.
4. Desktop polls `GET /api/v1/posts/:id` (or per-page status endpoint) to render success/failure per page. Retry: `POST /api/v1/posts/:id/retry` re-enqueues only failed page jobs.

## 5. Cross-cutting Concerns

- **Tenancy**: every domain row carries `workspace_id`; enforced in Prisma queries via a scoped repository base + `WorkspaceGuard`. No cross-workspace access.
- **AuthN**: JWT access token (15 min) + rotating refresh token (30 d, hashed at rest).
- **AuthZ**: RBAC — `owner | admin | member | viewer` per workspace; permission matrix enforced by `PermissionsGuard` + decorators.
- **Idempotency**: `Idempotency-Key` header on mutating endpoints; dedupe table + BullMQ `jobId` = deterministic hash → no duplicate posts on retry/double-click.
- **Secrets**: Meta tokens AES-256-GCM encrypted before DB (`social_tokens`); key from env/KMS. Tokens never leave backend — desktop sees only page metadata.
- **Observability**: structured JSON logs (pino), `activity_logs` table for user-facing audit, BullMQ metrics.
- **Versioning**: URI versioning `/api/v1`; contract package versioned with the API.

## 6. Environments

| Env | API | DB/Redis/Storage | Desktop connects to |
|---|---|---|---|
| local | `localhost:3001` | docker-compose | `http://localhost:3001` |
| staging | `api-stg.<domain>` | managed/compose on VPS | staging URL |
| production | `api.<domain>` | managed Postgres/Redis/S3 | `https://api.<domain>` |

Desktop resolves API base URL at login screen (configurable, defaults to production URL).
