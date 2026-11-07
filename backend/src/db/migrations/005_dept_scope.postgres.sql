-- 005_dept_scope.postgres.sql (PostgreSQL)
-- Phase 3 (P0-3/4/5 + P2-19) — bang anh xa PHONG BAN cho resource nghiep vu.
-- (Xem giai thich chi tiet o 005_dept_scope.sql)

CREATE TABLE IF NOT EXISTS resource_dept (
  table_name TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  dept_code TEXT NOT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  owner_employee_id BIGINT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (table_name, record_id)
);
CREATE INDEX IF NOT EXISTS idx_resource_dept_dept ON resource_dept(dept_code);
CREATE INDEX IF NOT EXISTS idx_resource_dept_table ON resource_dept(table_name);
