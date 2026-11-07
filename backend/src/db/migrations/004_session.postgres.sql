-- 004_session.postgres.sql (PostgreSQL)
-- Phase 2 (P0-2 + P1-11/12) — mo rong schema refresh_tokens thanh "session".
-- (PostgreSQL co ADD COLUMN IF NOT EXISTS nen idempotent ro rang.)

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS user_agent TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS ip TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS device_label TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotated_from_id BIGINT NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP NULL;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoked_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_active ON refresh_tokens(user_id, revoked, expires_at);

-- Phase 2 (P1-13): auth_version -> vohieu hoa toan bo access token khi
-- doi mat khau / doi role / khoa tai khoan (access token cu phai 401 ngay).
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 1;
