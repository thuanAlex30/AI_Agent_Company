const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const { get, run } = require('../src/common/db');
const salesService = require('../src/modules/sales/service');
const financeService = require('../src/modules/finance/service');

const S = Date.now();
async function stockOf(sku) {
  const r = await get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]);
  return Number(r.s);
}

test('o2c1: createOrder tru kho + sinh receivable + shipment', async () => {
  const cust = await get("SELECT * FROM customers WHERE code='KH001'");
  assert.ok(cust, 'seed KH001 phai ton tai');
  const before = await stockOf('CF-SUA-01');
  const out = await salesService.createOrder(null, {
    code: `DHT-${S}`, customer_id: cust.id, items: [{ sku: 'CF-SUA-01', qty: 2 }],
    created_by: 'test', idempotency_key: `idem-${S}`,
  });
  assert.equal(out.amount, 70000);
  assert.equal(out.status, 'pending');
  assert.equal(await stockOf('CF-SUA-01'), before - 2);
  const debt = await get('SELECT * FROM debts WHERE order_id=?', [out.id]);
  assert.ok(debt && Number(debt.amount) === 70000 && debt.type === 'receivable');
  const ship = await get('SELECT * FROM shipments WHERE order_id=?', [out.id]);
  assert.equal(ship.status, 'pending');
});

test('o2c2: trung Idempotency-Key khong tao don moi', async () => {
  const n0 = (await get("SELECT COUNT(*) c FROM orders WHERE code LIKE 'DHT-%'")).c;
  const dup = await salesService.createOrder(null, {
    code: `DHT-${S}-KHAC`, customer_id: 1, items: [{ sku: 'CF-SUA-01', qty: 1 }],
    created_by: 'test', idempotency_key: `idem-${S}`,
  });
  assert.equal(dup.deduped, true);
  const n1 = (await get("SELECT COUNT(*) c FROM orders WHERE code LIKE 'DHT-%'")).c;
  assert.equal(n0, n1);
});

test('o2c3: thanh toan du -> paid; cancel sau paid bi chan', async () => {
  const o = await get('SELECT * FROM orders WHERE code=?', [`DHT-${S}`]);
  const debt = await get('SELECT * FROM debts WHERE order_id=?', [o.id]);
  await financeService.recordPayment(null, { debt_id: debt.id, order_id: o.id, amount: 70000, method: 'cash', actor: 'test' });
  const o2 = await get('SELECT * FROM orders WHERE id=?', [o.id]);
  assert.equal(o2.status, 'paid');
  await assert.rejects(() => salesService.cancelOrder(null, o.id, 'test'), /refund/);
});

test('o2c4: refund hoan kho + payments am + debt cancelled', async () => {
  const o = await get('SELECT * FROM orders WHERE code=?', [`DHT-${S}`]);
  const before = await stockOf('CF-SUA-01');
  const out = await salesService.refundOrder(null, o.id, 'test');
  assert.equal(out.status, 'refunded');
  assert.equal(await stockOf('CF-SUA-01'), before + 2);
  const neg = await get('SELECT * FROM payments WHERE order_id=? AND amount<0', [o.id]);
  assert.ok(neg, 'phai co payment am hoan tien');
  const debt = await get('SELECT * FROM debts WHERE order_id=?', [o.id]);
  assert.equal(debt.status, 'cancelled');
  assert.equal(Number(debt.paid), 0);
});

test('o2c5: cancel don chua payment -> cancelled + hoan kho + debt cancelled', async () => {
  const cust = await get("SELECT * FROM customers WHERE code='KH001'");
  const before = await stockOf('BANH-01');
  const out = await salesService.createOrder(null, {
    code: `DHT-C-${S}`, customer_id: cust.id, items: [{ sku: 'BANH-01', qty: 1 }], created_by: 'test',
  });
  const r = await salesService.cancelOrder(null, out.id, 'test');
  assert.equal(r.status, 'cancelled');
  assert.equal(await stockOf('BANH-01'), before);
  const debt = await get('SELECT * FROM debts WHERE order_id=?', [out.id]);
  assert.equal(debt.status, 'cancelled');
});
