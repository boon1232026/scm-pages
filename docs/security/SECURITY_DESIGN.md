# Security Design

## Authentication
- Email+password registration → Argon2id hash (`argon2` npm). No plaintext ever.
- JWT access token: RS256/HS256 (env key), 15 min, claims `{sub, email}` — workspace resolved per-request.
- Refresh token: opaque random 256-bit, stored **hashed** (SHA-256), 30-day, rotation on every use; reuse-of-revoked detection revokes whole family.
- Meta OAuth: backend-generated `state` (HMAC-signed, 10 min TTL, bound to user+workspace). Tokens exchanged server-side only.

## Meta token protection
- Page & user access tokens encrypted **AES-256-GCM** before persistence (`social_tokens.token_encrypted` = iv‖tag‖ciphertext). Key from `TOKEN_ENCRYPTION_KEY` env (32B, KMS in prod).
- Tokens are never serialized to API responses — desktop sees `tokenStatus` enum only.
- Token validation via `debug_token` on sync/health check; expiry <7d → `expiring` + notification.

## Authorization (RBAC)
| Permission | owner | admin | member | viewer |
|---|---|---|---|---|
| workspace settings/billing | ✅ | ❌ | ❌ | ❌ |
| manage members | ✅ | ✅ | ❌ | ❌ |
| connect/disconnect social accounts | ✅ | ✅ | ❌ | ❌ |
| enable pages, publish, schedule | ✅ | ✅ | ✅ | ❌ |
| manage media/templates/configs | ✅ | ✅ | ✅ | ❌ |
| view all/history | ✅ | ✅ | ✅ | ✅ |

Enforced by `@RequirePermission()` + `PermissionsGuard`; workspace guard validates `X-Workspace-Id` membership on every scoped request.

## Tenant isolation
- Every workspace-scoped table carries `workspace_id`; repository base class injects the filter — no query path without it.
- Phase 6: Postgres Row-Level-Security as defense-in-depth.

## Transport & headers
- HTTPS only in non-local envs (HSTS). Meta OAuth `redirect_uri` must be HTTPS (except localhost dev).
- Helmet defaults, CORS allowlist (desktop uses custom scheme / configured origins).

## Input & upload safety
- All DTOs validated by shared Zod contracts (contracts package = single source).
- Media upload via presigned S3 PUT — server never proxies bytes; allowlisted MIME (`image/jpeg,png,webp`), max 10MB, SHA-256 dedupe, Sharp re-encodes (strips polyglot payloads).

## Rate limiting & abuse
- `nestjs-throttler`: 100 req/min/user global; stricter on auth (10/min/IP login).
- Idempotency keys on all publish endpoints; BullMQ dedupe `jobId` prevents double execution.
- Per-workspace publishing fan-out cap to stay within Meta rate limits.

## Audit
- `activity_logs` row for every mutating action (actor, action, entity, metadata, ip).
- `job_attempts` stores Meta response/errors for forensics.

## Secrets management
- `.env` gitignored; `.env.example` documents required vars. No secrets in source.
- Desktop stores only the API refresh token — in OS keychain via Tauri keyring plugin (not localStorage).

## Known platform constraints (documented, not worked around)
- Meta App Review needed for `pages_manage_posts`/`pages_manage_engagement` beyond dev/test users.
- Photo comment support depends on Graph API version & page type — feature-detected at runtime; `422 META_CAPABILITY_UNSUPPORTED` if rejected.
