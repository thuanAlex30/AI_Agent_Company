-- 007_qa_ref_id_text.postgres.sql — PostgreSQL dialect
--
-- BUG (PG-DB-08 / DATA-08): `qa_checks.ref_id` kieu BIGINT, nhung `ref_type`
-- cho phep 'product' — ma san pham la `products.sku` (TEXT, khoa chinh).
-- => KHONG the luu tham chieu san pham:
--    - SQLite: ghi tam chuoi 'CF-SUA-01' vao cot BIGINT (du lieu SAI, im lang)
--    - PostgreSQL: `22P02 invalid input syntax for type bigint: "CF-SUA-01"`
--      => 500 (loi that, khong phai loi nghiep vu)
--
-- FIX: doi `qa_checks.ref_id` sang TEXT. Gia tri cuoi giu nguyen (chi doi kieu
-- de chua ca so va ma). `repeat_of` van la BIGINT (tro toi qa_checks.id).
--
-- PG ALTER COLUMN ... TYPE TEXT USING ...::text la an toan (khong mat du lieu).

ALTER TABLE qa_checks ALTER COLUMN ref_id TYPE TEXT USING ref_id::TEXT;

CREATE INDEX IF NOT EXISTS idx_qa_checks_ref ON qa_checks(ref_type, ref_id);
