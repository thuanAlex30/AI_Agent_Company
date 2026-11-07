const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const { get, run } = require('../src/common/db');
const salesService = require('../src/modules/sales/service');
const financeService = require('../src/modules/finance/service');
const { ensureStockAll } = require('./helpers/stock');

const S = Date.now();
let debtId, orderId;

// BUG (TEST-ISO-01): ton kho bi tieu het giua cac file test (cung DB) =>
// payment/order test fail "Kho khong du ..." tren PostgreSQL.
test.before(async () => {
  await ensureStockAll(['CF-SUA-01', 'BANH-01', 'TRA-DAO-01'], 500);
});

test('pay1: Idempotency-Key chong double-click (bam dup khong dup payment)', async () => {
  const cust = await get("SELECT * FROM customers WHERE code='KH001'");
  const o = await salesService.createOrder(null, {
    code: `DHP-${S}`, customer_id: cust.id, items: [{ sku: 'CF-SUA-01', qty: 1 }], created_by: 'test',
  });
  orderId = o.id;
  const debt = await get('SELECT * FROM debts WHERE order_id=?', [o.id]);
  debtId = debt.id;
  const k = `pay-${S}`;
  const r1 = await financeService.recordPayment(null, { debt_id: debtId, order_id: orderId, amount: 10000, method: 'cash', actor: 'test', idempotency_key: k });
  assert.ok(r1.id && !r1.deduped);
  const r2 = await financeService.recordPayment(null, { debt_id: debtId, order_id: orderId, amount: 10000, method: 'cash', actor: 'test', idempotency_key: k });
  assert.equal(r2.deduped, true);
  assert.equal(r2.id, r1.id);
  const c = await get('SELECT COUNT(*) c FROM payments WHERE debt_id=?', [debtId]);
  assert.equal(Number(c.c), 1);
  const d2 = await get('SELECT * FROM debts WHERE id=?', [debtId]);
  assert.equal(Number(d2.paid), 10000);
  const oo = await get('SELECT * FROM orders WHERE id=?', [orderId]);
  assert.equal(oo.status, 'partial');
});

test('pay2: vuot remain bi chan', async () => {
  await assert.rejects(
    () => financeService.recordPayment(null, { debt_id: debtId, order_id: orderId, amount: 99999999, method: 'cash', actor: 'test' }),
    /remain/
  );
});

test('pay3: expense chua duyet -> APPROVAL_REQUIRED; duyet roi ghi payment', async () => {
  const code = `CPK-${S}`;
  // BUG (PG-DB-04): `created_by` la cot BIGINT (ID nguoi). Literal 'test'
  // trong SQL raw => SQLite ghi tam chuoi (du lieu sai, im lang), PG nem loi
  // "invalid input syntax for type bigint". => dung ID nguoi that.
  const admin = await get("SELECT id FROM users WHERE username='admin'");
  await run('INSERT INTO expenses(code,type,amount,paid,status,created_by) VALUES(?,\'fee\',500000,0,\'open\',?)', [code, admin.id]);
  const e = await get('SELECT * FROM expenses WHERE code=?', [code]);
  await assert.rejects(
    () => financeService.recordPayment(null, { expense_id: e.id, amount: 200000, method: 'cash', actor: 'test' }),
    (err) => err.code === 'APPROVAL_REQUIRED'
  );
  await run("INSERT INTO approvals(ref_type,ref_id,requester,level,status) VALUES('expense',?,?,'leader','approved')", [e.id, admin.id]);
  const r = await financeService.recordPayment(null, { expense_id: e.id, amount: 200000, method: 'cash', actor: 'test' });
  assert.ok(r.id);
  const e2 = await get('SELECT * FROM expenses WHERE id=?', [e.id]);
  assert.equal(Number(e2.paid), 200000);
});
