# Database Schema — PostgreSQL 16 (Prisma)

All tables have `id UUID PK`, `created_at`, `updated_at`. Workspace-scoped tables have `workspace_id` FK → `workspaces`, indexed. Soft delete via `deleted_at` where noted.

## Identity & Tenancy

**users** — `email CITEXT UNIQUE`, `password_hash`, `display_name`, `avatar_url`, `timezone` (default `Asia/Bangkok`), `locale` (`th`), `is_active`, `last_login_at`, `deleted_at`

**refresh_tokens** — `user_id FK`, `token_hash UNIQUE`, `family_id`, `expires_at`, `revoked_at`, `created_by_ip`, `user_agent` (rotation: reuse of revoked hash → revoke family)

**workspaces** — `name`, `slug UNIQUE`, `owner_id FK→users`, `plan` (`free|pro|team`), `settings JSONB`, `deleted_at`

**workspace_members** — `workspace_id`, `user_id`, `role ENUM(owner,admin,member,viewer)`, `invited_by`, `joined_at`; `UNIQUE(workspace_id,user_id)`

**workspace_invitations** — `workspace_id`, `email`, `role`, `token_hash UNIQUE`, `expires_at`, `accepted_at`

## Social / Meta

**social_accounts** — `workspace_id`, `provider ENUM(facebook)`, `provider_user_id`, `display_name`, `avatar_url`, `connected_by FK→users`, `status ENUM(active,expired,revoked)`, `scopes TEXT[]`, `last_synced_at`, `deleted_at`; `UNIQUE(workspace_id,provider,provider_user_id)`

**social_tokens** — `social_account_id FK`, `kind ENUM(user,page)`, `social_page_id FK NULL`, `token_encrypted BYTEA` (AES-256-GCM), `token_last4`, `expires_at`, `is_valid`, `last_validated_at`. Never returned to clients.

**social_pages** — `workspace_id`, `social_account_id`, `provider ENUM(facebook)`, `page_id` (Meta id), `name`, `category`, `avatar_url`, `followers_count`, `is_enabled`, `permissions TEXT[]` (from `/me/accounts`), `tasks TEXT[]`, `token_status ENUM(valid,expiring,expired,missing)`, `token_expires_at`, `last_synced_at`, `deleted_at`; `UNIQUE(workspace_id,page_id)`

## Media & Products

**media_assets** — `workspace_id`, `uploader_id`, `storage_key` (S3), `url`, `thumbnail_url`, `kind ENUM(image,video)`, `mime_type`, `size_bytes`, `width`, `height`, `sha256`, `category`, `name`, `tags TEXT[]`, `status ENUM(processing,ready,failed)`, `product_id NULL`, `deleted_at`; INDEX `(workspace_id,category)`, `(workspace_id,tags)` GIN

**products** — `workspace_id`, `name`, `sku`, `description`, `price NUMERIC(12,2)`, `currency CHAR(3)`, `is_active`, `deleted_at`

## Templates & Configs

**post_templates** — `workspace_id`, `name`, `body`, `media_ids UUID[]`, `variables JSONB` (e.g. `{{product_name}}`), `created_by`, `deleted_at`; `UNIQUE(workspace_id,name)` where not deleted

**comment_templates** — `workspace_id`, `name`, `body`, `media_id NULL`, `created_by`, `deleted_at`

**configurations** — `workspace_id`, `name`, `kind ENUM(post,comment,campaign)`, `payload JSONB` (page ids, text, media, schedule), `created_by`, `updated_by`; `UNIQUE(workspace_id,name,kind)`

## Publishing

**campaigns** — `workspace_id`, `name`, `description`, `status ENUM(draft,scheduled,running,completed,failed,cancelled)`, `scheduled_at`, `created_by`, `deleted_at`

**campaign_pages** — `campaign_id`, `social_page_id`; `UNIQUE(campaign_id,social_page_id)`

**posts** — `workspace_id`, `campaign_id NULL`, `created_by`, `kind ENUM(text,photo,multi_photo)`, `body`, `link_url NULL`, `idempotency_key`, `status ENUM(draft,queued,scheduled,publishing,published,partial,failed,cancelled)`, `scheduled_at`, `published_at`, `deleted_at`; `UNIQUE(workspace_id,idempotency_key)` where not null; INDEX `(workspace_id,status,scheduled_at)`

**post_media** — `post_id`, `media_asset_id`, `position`; `UNIQUE(post_id,position)`

**post_pages** — `post_id`, `social_page_id`, `body_override NULL`, `fb_post_id NULL`, `status ENUM(queued,publishing,published,failed,skipped)`, `attempt_count`, `last_error JSONB`, `published_at`; `UNIQUE(post_id,social_page_id)`; INDEX `(status)`

**comments** — `workspace_id`, `social_page_id`, `post_id NULL` (internal post if known), `fb_target_id` (post/comment object id), `parent_comment_id NULL`, `body`, `media_asset_id NULL`, `fb_comment_id NULL`, `status ENUM(queued,scheduled,publishing,published,failed)`, `scheduled_at`, `published_at`, `last_error JSONB`, `created_by`, `deleted_at`; INDEX `(workspace_id,status,scheduled_at)`

## Jobs & Audit

**scheduled_jobs** — `workspace_id`, `kind ENUM(publish_post,publish_comment,token_refresh,media_process)`, `ref_id UUID` (post/comment id), `queue_job_id`, `run_at`, `timezone`, `status ENUM(pending,enqueued,running,done,failed,cancelled)`, `dedupe_key`; `UNIQUE(dedupe_key)`; INDEX `(status,run_at)`

**job_attempts** — `scheduled_job_id`, `attempt_no`, `started_at`, `finished_at`, `status ENUM(success,failed)`, `error JSONB`, `meta_response JSONB`

**activity_logs** — `workspace_id`, `actor_id`, `action` (e.g. `post.created`), `entity_type`, `entity_id`, `metadata JSONB`, `ip`, `created_at`; INDEX `(workspace_id,created_at)`, `(entity_type,entity_id)`

**notifications** — `workspace_id`, `user_id NULL` (null = workspace-wide), `kind`, `title`, `body`, `data JSONB`, `read_at`; INDEX `(workspace_id,user_id,read_at)`

## Integrity rules

- Every FK `ON DELETE` behavior explicit: tenant rows cascade from `workspaces`; `posts.campaign_id` `SET NULL`; tokens cascade from `social_accounts`/`social_pages`.
- `idempotency_key` + `dedupe_key` partial unique indexes prevent duplicate publishes.
- Row-level isolation enforced in app layer (workspace_id on every query) + optional Postgres RLS (Phase 6 hardening, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` with `app.workspace_id` GUC).
