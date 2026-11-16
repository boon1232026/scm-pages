# Development Roadmap

Phase gate: a phase is done only when its exit criteria pass. Status tracked in `docs/audit/IMPLEMENTATION_STATUS.md`.

## Phase 0 — Audit & Planning ✅ (this document set)
Exit: audit doc, architecture, DB design, API spec, security design committed.

## Phase 1 — Project Foundation
- pnpm monorepo: `apps/{api,worker,desktop,admin}`, `packages/{contracts,sdk,config,ui}`
- Shared TS/eslint config; contracts package compiling; SDK skeleton
- NestJS API boots (`/health`), Worker boots, Vite+React+Tauri shell boots
- docker-compose: postgres:16, redis:7, minio (S3), optional mailhog
- Prisma schema covering DATABASE_SCHEMA.md + initial migration
- `.env.example`, README, GitHub Actions CI (lint+typecheck+test+build)

Exit: `pnpm install && pnpm dev` runs API+worker+desktop skeleton; `pnpm -r build` green; CI green.

## Phase 2 — Backend Core
- Auth module (register/login/refresh rotation/logout) + JWT guard
- Users, Workspaces, Members, Invitations, RBAC guard
- Activity log interceptor; Swagger; global error/validation
- Integration tests (auth flow, workspace isolation) — runs in CI with postgres/redis services

Exit: auth+workspace integration tests pass in CI.

## Phase 3 — Facebook Integration
- Meta OAuth start/callback (state-bound), token exchange → long-lived → encrypted storage
- Page discovery (`/me/accounts`), enable/disable, permission & health checks, resync
- Token refresh job (worker)

Exit: connect a real dev-mode FB app + page end-to-end; health endpoint reflects true token state.

## Phase 4 — Publishing & Comments
- Media module: presigned S3 upload, Sharp processing
- Posts: text/photo/multi-photo fan-out, per-page overrides, schedule, retry, idempotency
- Comments: text (+photo if capability verified), target picker feed endpoint
- scheduled_jobs + BullMQ workers + job_attempts + activity logs + notifications

Exit: real post published to 2+ dev pages incl. retry of forced failure; comment published.

## Phase 5 — Desktop Application
- Tauri 2 + React app, sidebar, 12 screens per spec, all via SDK → real API
- Login/logout (OS keychain token), workspace switcher
- States: loading/empty/error; status polling

Exit: full user flow on macOS dev build against local backend.

## Phase 6 — Production Hardening
- Rate limits, RLS, security review checklist, E2E (Playwright API-level), queue recovery drills, perf sanity, data isolation tests

Exit: TEST_RESULTS.md green; security checklist signed off.

## Phase 7 — Windows Build & Delivery
- Rust toolchain; `tauri build` on `windows-latest` GH runner → NSIS `SocialCommerceManager-Setup.exe`
- WebView2 bootstrapper handled by NSIS; smoke-test install on clean Windows VM
- Backend deployed to staging/prod URL baked as desktop default

Exit: installer artifact + install/login/API smoke test report.
