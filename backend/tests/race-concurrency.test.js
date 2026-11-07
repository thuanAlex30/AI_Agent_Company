// race-concurrency.test.js — TX-02 / TX-03 / TX-04
//   TX-02: hai don cung chay song song KHONG duoc lam ton kho am (oversell).
//   TX-03: hai payment cung chay song song KHONG duoc lam cong no vuot qua
//           (overpayment / double-credit).
//   TX-04: retry cung idempotency_key phai khong ghi trung (dedupe).
//
// LUU Y: stock_moves / payments / audit_log la bang "append-only" (trigger chan
// UPDATE/DELETE) -> test KHONG duoc xoa du lieu. Thay vao do moi test dung
// SKU / customer / idempotency key RIENG (co suffix random) de khong giao nhau.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');

const db = require('../src/common/db');
const salesService = require('../src/modules/sales/service');
const supplyService = require('../src/modules/supply/service');
const financeService = require('../src/modules/finance/service');
const { AppError } = require('../src/common/errors');

let n = 0;
function uid(prefix) {
  n += 1;
  return `${prefix}-${Date.now().toString(36)}-${n}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seed(sku, custCode, stock = 10) {
  await db.run('INSERT INTO products(sku,name,price,cost) VALUES(?,?,?,?)', [sku, 'Race Product ' + sku, 100000, 60000]);
  await db.run('INSERT INTO customers(code,name,phone,type) VALUES(?,?,?,?)', [custCode, 'Race Customer ' + custCode, '0999' + Math.floor(Math.random() * 1e6), 'retail']);
  // Dung moveStock de ton kho seed co audit (invariant I4: moi stock_move
  // phai co audit_log tuong ung).
  await supplyService.moveStock(null, { sku, type: 'in', qty: stock, ref_code: 'SEED', created_by: 'test' });
  return db.get('SELECT id FROM customers WHERE code=?', [custCode]);
}

async function onhand(sku) {
  const r = await db.get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]);
  return Number(r?.s || 0);
}

// --- TX-02: khong oversell --------------------------------------------------
test('tx02: hai don song song khong lam ton kho am (khong oversell)', async () => {
  const sku = uid('RACE-SKU');
  const cust = await seed(sku, uid('RACE-CUST'), 10);
  // Ton kho = 10; moi don lay 8 -> chi 1 don duoc, don con lai bi tu choi.
  const attempts = await Promise.allSettled([
    salesService.createOrder(null, { code: uid('RACE-ORD'), customer_id: cust.id, items: [{ sku, qty: 8 }], created_by: 'test' }),
    salesService.createOrder(null, { code: uid('RACE-ORD'), customer_id: cust.id, items: [{ sku, qty: 8 }], created_by: 'test' }),
  ]);
  const okCount = attempts.filter((a) => a.status === 'fulfilled').length;
  const rejectCount = attempts.filter((a) => a.status === 'rejected').length;
  assert.equal(okCount, 1, 'Chi 1 don duoc tao');
  assert.equal(rejectCount, 1, 'Don thu 2 bi tu choi');
  const err = attempts.find((a) => a.status === 'rejected').reason;
  assert.ok(err instanceof AppError, 'Loi phai la AppError');
  assert.equal(err.code, 'STOCK_SHORTAGE');
  assert.equal(err.status, 409);

  const left = await onhand(sku);
  assert.equal(left, 2, 'Ton kho con lai phai = 10 - 8 = 2');
  assert.ok(left >= 0, 'Ton kho khong duoc am');
});

// --- TX-02 (variation): 3 don cung chay song song ---------------------------
test('tx02: nhieu don song song — ton kho khong bao gio am', async () => {
  const sku = uid('RACE-SKU');
  const cust = await seed(sku, uid('RACE-CUST'), 10);
  const attempts = await Promise.allSettled([
    salesService.createOrder(null, { code: uid('RACE-ORD'), customer_id: cust.id, items: [{ sku, qty: 4 }], created_by: 'test' }),
    salesService.createOrder(null, { code: uid('RACE-ORD'), customer_id: cust.id, items: [{ sku, qty: 4 }], created_by: 'test' }),
    salesService.createOrder(null, { code: uid('RACE-ORD'), customer_id: cust.id, items: [{ sku, qty: 4 }], created_by: 'test' }),
  ]);
  const okCount = attempts.filter((a) => a.status === 'fulfilled').length;
  assert.ok(okCount <= 2, 'Toi da 2 don moi duoc tao (10 ton / 4 moi don)');
  const left = await onhand(sku);
  assert.ok(left >= 0, 'Ton kho khong duoc am');
  assert.equal(left, 10 - okCount * 4);
});

// --- TX-03: khong overpayment ----------------------------------------------
test('tx03: hai payment song song tren cung cong no — khong vuot so du', async () => {
  const sku = uid('RACE-SKU');
  const cust = await seed(sku, uid('RACE-CUST'), 10);
  const { id: debtId } = await financeService.createReceivable(null, { customer_id: cust.id, amount: 100, created_by: 'test', note: 'race debt' });

  // Hai payment 70 dong thoi tren cong no 100 -> chi 1 duoc ghi.
  const attempts = await Promise.allSettled([
    financeService.recordPayment(null, { debt_id: debtId, amount: 70, method: 'cash', actor: 'test', idempotency_key: uid('race-pay') }),
    financeService.recordPayment(null, { debt_id: debtId, amount: 70, method: 'cash', actor: 'test', idempotency_key: uid('race-pay') }),
  ]);
  const okCount = attempts.filter((a) => a.status === 'fulfilled').length;
  assert.equal(okCount, 1, 'Chi 1 payment duoc ghi');
  const err = attempts.find((a) => a.status === 'rejected').reason;
  assert.ok(err instanceof AppError);
  assert.equal(err.status, 400);

  const debt = await db.get('SELECT amount, paid, status FROM debts WHERE id=?', [debtId]);
  assert.equal(Number(debt.paid), 70, 'Cong no chi duoc ghi 70');
  assert.ok(Number(debt.paid) <= Number(debt.amount), 'paid khong duoc vuot amount');

  const pays = await db.all('SELECT amount FROM payments WHERE debt_id=?', [debtId]);
  assert.equal(pays.length, 1, 'Chi 1 dong payment duoc ghi');
});

// --- TX-03 (variation): payment chia nho song song --------------------------
test('tx03: nhieu payment nho song song — tong paid khong vuot amount', async () => {
  const sku = uid('RACE-SKU');
  const cust = await seed(sku, uid('RACE-CUST'), 10);
  const { id: debtId } = await financeService.createReceivable(null, { customer_id: cust.id, amount: 100, created_by: 'test', note: 'race debt 2' });

  const attempts = await Promise.allSettled([
    financeService.recordPayment(null, { debt_id: debtId, amount: 30, method: 'cash', actor: 'test', idempotency_key: uid('race-pay') }),
    financeService.recordPayment(null, { debt_id: debtId, amount: 30, method: 'cash', actor: 'test', idempotency_key: uid('race-pay') }),
    financeService.recordPayment(null, { debt_id: debtId, amount: 30, method: 'cash', actor: 'test', idempotency_key: uid('race-pay') }),
    financeService.recordPayment(null, { debt_id: debtId, amount: 30, method: 'cash', actor: 'test', idempotency_key: uid('race-pay') }),
  ]);
  const okCount = attempts.filter((a) => a.status === 'fulfilled').length;
  const debt = await db.get('SELECT amount, paid FROM debts WHERE id=?', [debtId]);
  assert.ok(Number(debt.paid) <= Number(debt.amount), 'paid khong duoc vuot amount');
  assert.equal(Number(debt.paid), okCount * 30);
  assert.ok(okCount <= 3, 'Toi da 3 payment 30 duoc ghi tren cong no 100');
});

// --- TX-04: idempotency dedupe ---------------------------------------------
test('tx04: retry cung idempotency_key chi ghi 1 lan', async () => {
  const sku = uid('RACE-SKU');
  const cust = await seed(sku, uid('RACE-CUST'), 10);
  const { id: debtId } = await financeService.createReceivable(null, { customer_id: cust.id, amount: 100, created_by: 'test' });
  const key = uid('race-idem');
  const a = await financeService.recordPayment(null, { debt_id: debtId, amount: 50, method: 'cash', actor: 'test', idempotency_key: key });
  const b = await financeService.recordPayment(null, { debt_id: debtId, amount: 50, method: 'cash', actor: 'test', idempotency_key: key });
  assert.equal(a.id, b.id, 'Retry phai tra cung ID payment');
  assert.equal(b.deduped, true, 'Retry phai duoc danh dau deduped');
  const pays = await db.all('SELECT id FROM payments WHERE debt_id=?', [debtId]);
  assert.equal(pays.length, 1, 'Chi 1 payment duoc ghi');
  const debt = await db.get('SELECT paid FROM debts WHERE id=?', [debtId]);
  assert.equal(Number(debt.paid), 50, 'Cong no khong bi ghi 2 lan');
});

test('tx04: retry cung idempotency_key tren don — chi tao 1 don', async () => {
  const sku = uid('RACE-SKU');
  const cust = await seed(sku, uid('RACE-CUST'), 10);
  const key = uid('race-idem-order');
  const code = uid('RACE-ORD');
  const a = await salesService.createOrder(null, { code, customer_id: cust.id, items: [{ sku, qty: 2 }], created_by: 'test', idempotency_key: key });
  const b = await salesService.createOrder(null, { code, customer_id: cust.id, items: [{ sku, qty: 2 }], created_by: 'test', idempotency_key: key });
  assert.equal(a.id, b.id, 'Retry phai tra cung ID don');
  const orders = await db.all('SELECT id FROM orders WHERE idempotency_key=?', [key]);
  assert.equal(orders.length, 1, 'Chi 1 don duoc tao');
  const left = await onhand(sku);
  assert.equal(left, 8, 'Ton kho chi truoc 1 lan (khong truoc 2 lan)');
});

// --- TX-02 (supply): moveStock out khong duoc lam am ton kho ----------------
test('tx02: hai moveStock out song song — ton kho khong am', async () => {
  const sku = uid('RACE-SKU');
  await seed(sku, uid('RACE-CUST'), 10);
  const attempts = await Promise.allSettled([
    supplyService.moveStock(null, { sku, type: 'out', qty: -7, ref_code: uid('RACE-OUT'), created_by: 'test' }),
    supplyService.moveStock(null, { sku, type: 'out', qty: -7, ref_code: uid('RACE-OUT'), created_by: 'test' }),
  ]);
  const okCount = attempts.filter((a) => a.status === 'fulfilled').length;
  assert.equal(okCount, 1, 'Chi 1 lan xuat kho duoc phep');
  const left = await onhand(sku);
  assert.equal(left, 3, 'Ton kho con lai = 10 - 7');
  assert.ok(left >= 0);
});
