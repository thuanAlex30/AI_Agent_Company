-- 003_datetime_normalize.postgres.sql (PostgreSQL)
-- Phase 0.6 — chuan hoa MOI cot timestamp ve MOT dinh dang: 'YYYY-MM-DD HH:mm:ss'.
--
-- VAN DE (P1-11): cac noi insert het thoi diem bang nhieu dinh dang khac nhau
-- ('...T...Z' vs '... ...'), nen dieu kien so sanh CHUOI `expires_at > ?` SAI.
--
-- FIX: doi kieu cot sang TEXT, gia tri chuan hoa theo gio VN (Asia/Ho_Chi_Minh),
-- format 'YYYY-MM-DD HH24:MI:SS'. Tu nay moi noi dung toSqlDateTime() de ghi.

ALTER TABLE refresh_tokens
  ALTER COLUMN expires_at TYPE TEXT
  USING to_char((expires_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD HH24:MI:SS');

ALTER TABLE order_lookup_tokens
  ALTER COLUMN expires_at TYPE TEXT
  USING to_char((expires_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), 'YYYY-MM-DD HH24:MI:SS');
