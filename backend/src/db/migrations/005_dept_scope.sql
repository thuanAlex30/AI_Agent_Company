-- 005_dept_scope.sql (SQLite)
-- Phase 3 (P0-3/4/5 + P2-19) — bang anh xa PHONG BAN cho resource nghiep vu.
--
-- VAN DE (P0-4):
--   Bang nghiep vu nhu `orders`, `customers`, `debts`, `payments`, `contracts`,
--   `tickets` KHONG co cot `dept_code`. RESOURCE_DEPT trong common/scope.js
--   map chung ve `null` => `assertResourceScope` BO QUA check => IDOR:
--   doi URL id don cua phong ban khac van doc/ghi duoc.
--
-- FIX: bang `resource_dept` la bang danh muc khoa (table_name, record_id) ->
-- dept_code (+ owner_employee_id). Service so huu ghi vao bang nay TRONG
-- CUNG transaction voi du lieu (INV-2), doc thi scope.js doc ra de fail-closed.

CREATE TABLE IF NOT EXISTS resource_dept (
  table_name TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  dept_code TEXT NOT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  owner_employee_id BIGINT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (table_name, record_id)
);
CREATE INDEX IF NOT EXISTS idx_resource_dept_dept ON resource_dept(dept_code);
CREATE INDEX IF NOT EXISTS idx_resource_dept_table ON resource_dept(table_name);
