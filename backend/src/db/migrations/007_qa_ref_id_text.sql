-- 007_qa_ref_id_text.sql — SQLite dialect
--
-- BUG (PG-DB-08 / DATA-08): `qa_checks.ref_id` kieu BIGINT, nhung `ref_type`
-- cho phep 'product' — ma san pham la `products.sku` (TEXT, khoa chinh).
-- => KHONG the luu tham chieu san pham:
--    - SQLite: ghi tam chuoi 'CF-SUA-01' vao cot BIGINT (du lieu SAI, im lang)
--    - PostgreSQL: `22P02 invalid input syntax for type bigint: "CF-SUA-01"`
--      => 500 (loi that, khong phai loi nghiep vu)
--    - `qa/service.js` truy van `SELECT id FROM products WHERE id=?` — `products`
--      KHONG co cot `id` (khoa chinh la `sku`) => "column id does not exist".
--
-- FIX: doi `qa_checks.ref_id` sang TEXT (gia tri cuoi giu nguyen, chi doi kieu
-- de chua ca so va ma). `repeat_of` van la BIGINT (tro toi qa_checks.id).
--
-- Giu nguyen API: `ref_id` trong JSON van la gia tri client gui (so hoac chuoi).

-- SQLite: tao bang moi -> chep du lieu -> xoa bang cu -> doi ten.
-- (SQLite khong co ALTER COLUMN TYPE => phai tao lai bang.)
CREATE TABLE IF NOT EXISTS qa_checks_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('order','shipment','product')),
  ref_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','fail')),
  defect TEXT NULL,
  repeat_of BIGINT NULL,
  checker BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO qa_checks_new(id, ref_type, ref_id, result, defect, repeat_of, checker, created_at)
SELECT id, ref_type, CAST(ref_id AS TEXT), result, defect, repeat_of, checker, created_at
FROM qa_checks
WHERE true;

DROP TABLE qa_checks;

ALTER TABLE qa_checks_new RENAME TO qa_checks;

CREATE INDEX IF NOT EXISTS idx_qa_checks_ref ON qa_checks(ref_type, ref_id);
