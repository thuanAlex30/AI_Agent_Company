// helpers/triggers.js — tien ich DIALECT-AWARE cho test.
//
// BUG (PG-DB-06): nhieu test drop/tao trigger append-only bang SQL:
//     DROP TRIGGER IF EXISTS trg_no_delete_stock          <- SQLite
//     CREATE TRIGGER IF NOT EXISTS ... BEGIN SELECT RAISE(ABORT,'...'); END
// Tren PostgreSQL:
//   - `DROP TRIGGER IF EXISTS x` (thieu `ON <table>`) -> ERROR 42601
//     "syntax error at end of input" => ca `cleanup()`/setup() throw.
//   - `CREATE TRIGGER IF NOT EXISTS ... BEGIN ... END` -> PG KHONG ho tro
//     `IF NOT EXISTS` cho CREATE TRIGGER.
// => job `backend-postgres` FAIL o cac test reconcile/public-write.
//
// FIX: ham duy nhat cho ca 2 dialect:
//   - SQLite: trigger inline (BEGIN ... END) theo bang.
//   - PostgreSQL: 1 function plpgsql + trigger BEFORE UPDATE OR DELETE.
const { run, DIALECT } = require('../../src/common/db');

const PG_FN = {
  payments: 'fn_block_payments_write',
  stock_moves: 'fn_block_stock_write',
  audit_log: 'fn_block_audit_write',
};

const PG_MSG = {
  payments: 'payments append-only',
  stock_moves: 'stock_moves append-only',
  audit_log: 'audit append-only',
};

/** Tao trigger chan UPDATE/DELETE tren bang (append-only). Dialect-aware. */
async function createAppendOnlyTrigger(table) {
  if (DIALECT === 'pg') {
    const fn = PG_FN[table];
    const msg = PG_MSG[table];
    await run(`CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION '${msg}'; END; $$ LANGUAGE plpgsql`);
    await run(`DROP TRIGGER IF EXISTS trg_no_update_${table} ON ${table}`);
    await run(`CREATE TRIGGER trg_no_update_${table} BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fn}()`);
    return;
  }
  await run(`DROP TRIGGER IF EXISTS trg_no_update_${table}`);
  await run(`DROP TRIGGER IF EXISTS trg_no_delete_${table}`);
  await run(`CREATE TRIGGER IF NOT EXISTS trg_no_update_${table} BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'${PG_MSG[table]}'); END`);
  await run(`CREATE TRIGGER IF NOT EXISTS trg_no_delete_${table} BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'${PG_MSG[table]}'); END`);
}

/**
 * Dam bao trigger append-only TON TAI (idempotent).
 *
 * BUG (TEST-ISO-02): trigger la TRANG THAI CUA DB (khong phai trang thai cua
 * file test). File test A drop trigger de don data, file test B (chay sau)
 * thua nhieu co the gap trang thai "khong co trigger" => CHECK append-only
 * bi BO QUA => test mau khong con bao ve (va co the lam test khac fail tuy
 * bien).
 * => DUNG ham nay o `before` hook de KHOI PHUC trang thai chuan truoc khi test.
 */
async function ensureAppendOnlyTrigger(table) {
  await createAppendOnlyTrigger(table);
}

/** Xoa trigger chan UPDATE/DELETE tren bang. Dialect-aware. */
async function dropAppendOnlyTrigger(table) {
  if (DIALECT === 'pg') {
    await run(`DROP TRIGGER IF EXISTS trg_no_update_${table} ON ${table}`);
    return;
  }
  await run(`DROP TRIGGER IF EXISTS trg_no_update_${table}`);
  await run(`DROP TRIGGER IF EXISTS trg_no_delete_${table}`);
}

module.exports = { createAppendOnlyTrigger, dropAppendOnlyTrigger, ensureAppendOnlyTrigger };
