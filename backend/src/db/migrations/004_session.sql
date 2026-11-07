-- 004_session.sql (SQLite)
-- Phase 2 (P0-2 + P1-11/12) — mo rong schema refresh_tokens thanh "session".
--
-- VAY DU:
--   - token_hash TRONG (chi luu hash, khong luu token ban ro)
--   - user_agent / ip / device_label: nhan dien thiet bi + phat hien reuse
--   - rotated_from_id: lien he token moi <- token cu (chuoi xoay vong)
--   - last_used_at: lan dung gan nhat
--   - revoked_reason: 'reuse' | 'session_limit' | 'logout' | 'logout_all' | 'expired'
--
-- LUU Y (SQLite): khong co `ADD COLUMN IF NOT EXISTS` => migrate.js tach statement
-- va bo qua CHINH XAC loi "duplicate column name" (idempotent).

ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN ip TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN device_label TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN rotated_from_id BIGINT NULL;
ALTER TABLE refresh_tokens ADD COLUMN last_used_at TIMESTAMP NULL;
ALTER TABLE refresh_tokens ADD COLUMN revoked_reason TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_active ON refresh_tokens(user_id, revoked, expires_at);

-- Phase 2 (P1-13): auth_version -> vohieu hoa toan bo access token khi
-- doi mat khau / doi role / khoa tai khoan (access token cu phai 401 ngay).
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1;
