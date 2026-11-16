# Deployment Guide

## Local development

Prerequisites: Node 22, pnpm 9, Docker Desktop (Postgres/Redis/MinIO), Rust (desktop only).

```bash
pnpm install
docker compose -f infrastructure/docker/docker-compose.yml up -d
cp .env.example .env          # fill values
pnpm --filter @scm/api exec prisma migrate dev
pnpm dev                      # api :3001, worker, desktop (vite :1420 + tauri)
```

## Environments

| Env | API | Desktop API base |
|---|---|---|
| local | `http://localhost:3001` | same |
| staging | `https://api-stg.example.com` | selectable at login |
| production | `https://api.example.com` | default baked at build |

## Backend deployment (Docker)

`infrastructure/docker/Dockerfile.api` and `Dockerfile.worker` (multi-stage node:22-alpine). Compose example for a single VPS; production should use managed Postgres + Redis + S3.

Required env: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` (32B hex), `S3_*`, `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION=v25.0`, `META_OAUTH_REDIRECT_URI`, `CORS_ORIGINS`, `APP_URL`.

1. `docker compose -f infrastructure/docker/docker-compose.prod.yml up -d`
2. `prisma migrate deploy`
3. TLS termination via Caddy/Nginx — HTTPS mandatory (Meta OAuth).

## Desktop configuration

Desktop reads `VITE_API_BASE_URL` at build; user may override at login screen. Refresh token stored in OS keychain (tauri-plugin keyring).

## Meta App setup checklist

1. Create app at developers.facebook.com → product "Facebook Login for Business"/"Pages".
2. Scopes: `pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_engagement` (+`business_management` if BM pages).
3. OAuth redirect URI = `{API_URL}/api/v1/auth/meta/callback`.
4. Dev mode: add testers & test pages. Production: submit App Review for the scopes.
