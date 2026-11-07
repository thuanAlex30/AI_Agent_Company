-- scripts/pg-audit-role.sql — GOV-02: phan quyen rieng cho audit_log.
--
-- YEU CAU: chay voi superuser/owner (khong chay trong migration tu dong,
-- vi migration chay bang app user khong co quyen tao ROLE).
--
--   psql "postgresql://bizops:<pw>@host:5432/bizops" -f backend/scripts/pg-audit-role.sql
--
-- Muc dich:
--   1. Audit log la BAT BIEN — app user (bizops_app) chi duoc INSERT + SELECT,
--      KHONG duoc UPDATE/DELETE (ngoai trigger, con lop bao ve duoi DB).
--   2. Role rieng `bizops_audit` chi doc (SELECT) audit_log — dung cho
--      auditor/bao cao, khong the gia mau hay xoa bang chung.
--   3. Truy van doc audit tu app van di qua app user (backend) — app dung
--      `SELECT` trong cung connection pool.
--
-- Idempotent: chay lai nhieu lan khong loi.

-- ---------------------------------------------------------------------------
-- 1. Role app (neu chua co). Mat khau lay tu bien moi truong, KHONG hard-code.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizops_app') THEN
    EXECUTE format('CREATE ROLE bizops_app LOGIN PASSWORD %L', COALESCE(current_setting('bizops.app_password', true), 'CHANGE_ME_BEFORE_USE'));
    RAISE NOTICE 'Da tao role bizops_app';
  ELSE
    RAISE NOTICE 'Role bizops_app da ton tai';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bizops_audit') THEN
    CREATE ROLE bizops_audit LOGIN PASSWORD 'CHANGE_ME_BEFORE_USE';
    RAISE NOTICE 'Da tao role bizops_audit';
  ELSE
    RAISE NOTICE 'Role bizops_audit da ton tai';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Grant cho app user: DML tren bang nghiep vu, INSERT+SELECT tren audit.
--    (REVOKE UPDATE/DELETE tren audit_log o cap quyen cua app.)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO bizops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bizops_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO bizops_app;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM bizops_app;
GRANT SELECT, INSERT ON audit_log TO bizops_app;

-- ---------------------------------------------------------------------------
-- 3. Role auditor: CHI DOC audit_log. Khong duoc INSERT/UPDATE/DELETE.
-- ---------------------------------------------------------------------------
GRANT CONNECT ON DATABASE :dbname TO bizops_audit;
GRANT USAGE ON SCHEMA public TO bizops_audit;
GRANT SELECT ON audit_log TO bizops_audit;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_log FROM bizops_audit;

-- ---------------------------------------------------------------------------
-- 4. Mac dinh moi tuong lai + hard-code quyen cua app (trong truong hop
--    GRANT ... ALL TABLES da cap quyen update/delete tren audit_log o buoc 2).
-- ---------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bizops_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE, DELETE ON audit_log FROM bizops_app;

-- ---------------------------------------------------------------------------
-- 5. Verify
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad
  FROM information_schema.role_table_grants
  WHERE grantee = 'bizops_app'
    AND table_name = 'audit_log'
    AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  IF bad > 0 THEN
    RAISE EXCEPTION 'GOV-02 FAIL: bizops_app van co quyen ghi/xoa tren audit_log';
  END IF;
  RAISE NOTICE 'GOV-02 OK: audit_log chi INSERT/SELECT voi app, chi SELECT voi auditor';
END
$$;
