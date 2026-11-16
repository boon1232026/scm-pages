# Test Results

_Last updated: Phase 4 — publishing pipeline. Re-run: `pnpm --filter @scm/api test:e2e`_

## Automated suites

| Suite | Command | Result |
|---|---|---|
| Auth & Workspaces e2e | `pnpm --filter @scm/api test:e2e` (`test/auth.e2e-spec.ts`) | 9/9 pass |
| Phase 4 publishing e2e | same run (`test/phase4.e2e-spec.ts`) | 13/13 pass |
| TokenCrypto unit (encrypt/decrypt round-trip) | `pnpm --filter @scm/api test` | pass |
| Workspace typecheck | `pnpm -r typecheck` | pass |
| Workspace build | `pnpm -r build` | pass |

E2E environment: real PostgreSQL (`scm_test`), real Redis/BullMQ, real Nest app via
supertest. No mocked persistence or auth.

### Covered by e2e
- register/login/refresh-rotation/reuse-rejection/logout, workspace RBAC (viewer vs owner)
- media: mime validation (rejects `application/x-msdownload`), presigned ticket + `processing` row
- posts: contract refinement (text+media → 400), cross-workspace page → 404,
  create → `queued` + `scheduled_jobs` row with deterministic `pp-*` jobId,
  idempotent replay returns same post id, workspace isolation → 404
- comments: create → `queued`, empty comment → 400
- templates + configurations CRUD
- scheduled-jobs listing scoped to workspace

## Live pipeline verification (local dev stack)

Postgres 16 + Redis + s3rver + API + worker, real Meta Graph API:

| Step | Evidence |
|---|---|
| Health | `GET /api/v1/health` → `{status:"ok",checks:{db:"up"}}` |
| Media upload | presign → `PUT` → 200 → `complete` → worker (Sharp) → `ready`, 800x600, thumbnail |
| Post create | `POST /posts` → `queued`, idempotent replay → same id |
| Real Meta call | worker called Graph API → `{code:190, Invalid OAuth access token data}` recorded |
| Fail-fast | `retriable:false` → `failed` after 1 attempt (no wasted retries) |
| Retry | `POST /posts/:id/retry` → re-enqueued, `post.retried` in activity log |
| Meta OAuth w/o creds | 503 `META_OAUTH_FAILED` (honest failure, no fake success) |

## Known gaps (tracked in IMPLEMENTATION_STATUS.md)
- No unit tests yet for queue.service jobId sanitization (covered indirectly by e2e enqueue).
- Worker processors are verified via live pipeline, not yet via isolated unit tests.
- `packages/ui` has no tsconfig (typecheck script tolerates this — tech debt).
- Meta success-path publishing (200 from Graph API) requires real app credentials;
  failure path is verified end-to-end, success path is verified by request shape only.
