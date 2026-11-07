const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const { tx, get } = require('../src/common/db');
const { writeAudit } = require('../src/common/audit');

// BUG (TEST-ISO-02): trigger append-only la TRANG THAI CUA DB. File test khac
// co the da drop trigger => khoi phuc truoc moi test (khong thi CHECK bi bo qua
// va test "audit append-only" se fail tuy bien).
test.before(async () => {
  const { ensureAppendOnlyTrigger } = require('./helpers/triggers');
  await ensureAppendOnlyTrigger('audit_log');
  await ensureAppendOnlyTrigger('payments');
  await ensureAppendOnlyTrigger('stock_moves');
});

test('audit1: writeAudit trong tx ghi du actor/action/table/record', async () => {
  const id = Date.now();
  await tx(async (conn) => {
    await writeAudit(conn, 'admin', 'create', 'debts', id, null, { amount: 1000 });
  });
  const row = await get('SELECT * FROM audit_log WHERE table_name=? AND record_id=? ORDER BY id DESC LIMIT 1', ['debts', id]);
  assert.ok(row && row.actor === 'admin' && row.action === 'create');
});

test('audit2: audit_log append-only (cam UPDATE/DELETE)', async () => {
  await tx(async (conn) => {
    await writeAudit(conn, 'admin', 'create', 'debts', 999998, null, { x: 1 });
  });
  const row = await get("SELECT id FROM audit_log WHERE record_id=999998 ORDER BY id DESC LIMIT 1");
  let blocked = 0;
  try { await get(`UPDATE audit_log SET action='x' WHERE id=${row.id}`); } catch { blocked++; }
  assert.ok(blocked >= 0); // sqlite trigger nem loi -> get() throw
  const { run } = require('../src/common/db');
  await assert.rejects(() => run(`UPDATE audit_log SET action='x' WHERE id=${row.id}`));
  await assert.rejects(() => run(`DELETE FROM audit_log WHERE id=${row.id}`));
});

// --- GOV-01 / AUDIT-ATOMIC-001 ---------------------------------------------
// Audit insert that FAIL (record_id NULL -> NOT NULL constraint) phai lam
// rollback TOAN BO mutation nghiep vu trong cung transaction.
// Neu mutation van commit -> bang chung audit co the bi "bo reu" -> vi pham.
test('gov01: audit insert fail -> mutation nghiep vu phai rollback', async () => {
  const { run: dbRun } = require('../src/common/db');
  const code = 'GOV01-' + Date.now();
  let threw = false;
  await assert.rejects(
    () => tx(async (conn) => {
      await conn.run('INSERT INTO customers(code,name,phone,type) VALUES(?,?,?,?)', [code, 'GOV01', '0900000000', 'retail']);
      // record_id = null -> audit_log.record_id NOT NULL -> insert that -> rollback
      await writeAudit(conn, 'admin', 'create', 'customers', null, null, { code });
    }),
    (e) => { threw = true; return true; }
  );
  assert.ok(threw, 'transaction phai throw khi audit insert that');
  const row = await get('SELECT id FROM customers WHERE code=?', [code]);
  assert.equal(row, null, 'mutation nghiep vu phai bi rollback khi audit that');
});

// --- GOV-01: audit ghi trong CUNG transaction voi mutation --------------------
// Service co ghi audit qua conn (khong phai module-level run()).
test('gov01: mutation + audit commit cung nhau', async () => {
  const { run: dbRun } = require('../src/common/db');
  const code = 'GOV01OK-' + Date.now();
  await tx(async (conn) => {
    const r = await conn.run('INSERT INTO customers(code,name,phone,type) VALUES(?,?,?,?)', [code, 'GOV01 OK', '0900000001', 'retail']);
    await writeAudit(conn, 'admin', 'create', 'customers', r.lastInsertRowid, null, { code });
  });
  const cust = await get('SELECT id FROM customers WHERE code=?', [code]);
  assert.ok(cust, 'mutation phai commit');
  const aud = await get('SELECT * FROM audit_log WHERE table_name=? AND record_id=?', ['customers', cust.id]);
  assert.ok(aud, 'audit phai commit cung mutation');
  assert.equal(aud.actor, 'admin');
  assert.equal(aud.action, 'create');
});
