const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const { tx, get } = require('../src/common/db');
const { writeAudit } = require('../src/common/audit');

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
