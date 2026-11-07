-- 003_datetime_normalize.sql (SQLite)
-- Phase 0.6 — chuan hoa MOI cot timestamp ve MOT dinh dang: 'YYYY-MM-DD HH:mm:ss'.
--
-- VAN DE (P1-11):
--   refresh_tokens.expires_at      <- new Date(...).toISOString()  => '2026-11-14T03:11:54.871Z'
--   order_lookup_tokens.expires_at <- .toISOString().slice(0,19)     => '2026-11-14 03:11:54'
--   nowISO()                                                          => '2026-11-07 03:11:54'
-- => so sanh CHUOI lech nhau ('T' vs ' ', co/khong 'Z') => dieu kien
--    `expires_at > ?` / `expires_at < ?` SAI.
--
-- FIX: ep moi gia tri cua expires_at ve 'YYYY-MM-DD HH:mm:ss' (gio VN).
-- Sau do moi noi dung to_sql_date_time() de INSERT (xem common/db.js).

UPDATE refresh_tokens
   SET expires_at = substr(replace(expires_at, 'T', ' '), 1, 19)
 WHERE length(expires_at) > 19;

UPDATE order_lookup_tokens
   SET expires_at = substr(replace(expires_at, 'T', ' '), 1, 19)
 WHERE length(expires_at) > 19;

-- created_at/updated_at mac dinh CURRENT_TIMESTAMP da la 'YYYY-MM-DD HH:MM:SS'.
-- Nhung du lieu cu co thể chua co giay -> chuan hoa cho chắc.
UPDATE refresh_tokens
   SET created_at = substr(replace(created_at, 'T', ' '), 1, 19)
 WHERE created_at IS NOT NULL AND length(created_at) < 19;

UPDATE order_lookup_tokens
   SET created_at = substr(replace(created_at, 'T', ' '), 1, 19)
 WHERE created_at IS NOT NULL AND length(created_at) < 19;
