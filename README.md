# Social Commerce Manager

API-first desktop application for managing Facebook Page publishing across multiple pages — text/photo posts, comments, scheduling, templates and media library for online shops.

**Stack**: Tauri 2 + React + TypeScript (desktop) · NestJS + Prisma (API) · PostgreSQL · Redis + BullMQ (worker) · S3 (media) · pnpm monorepo.

## Layout

```
apps/        desktop (Tauri) · api (NestJS :3001) · worker (BullMQ) · admin (later)
packages/    contracts (zod API schemas) · sdk (typed client) · config · ui
infrastructure/docker   postgres + redis + minio compose
docs/        architecture · database · api · security · deployment · audit
```

## Quick start

```bash
pnpm install
pnpm infra:up                                  # docker: postgres, redis, minio
cp .env.example .env                           # fill META_APP_* later
pnpm --filter @scm/api exec prisma migrate dev # DB schema
pnpm --filter @scm/contracts --filter @scm/sdk build
pnpm dev                                       # api + worker + desktop(vite)
```

- API: http://localhost:3001/api/v1 · Swagger: http://localhost:3001/api/docs
- Desktop dev UI: http://localhost:1420 · `pnpm --filter @scm/desktop dev:tauri` for the Tauri shell (needs Rust)

## Status

See `docs/audit/IMPLEMENTATION_STATUS.md` — currently Phase 1 (foundation).
