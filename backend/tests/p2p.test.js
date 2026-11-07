const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const { get, run } = require('../src/common/db');
const supplyService = require('../src/modules/supply/service');
const { ensureStockAll } = require('./helpers/stock');

const S = Date.now();
let poId;
async function stockOf(sku) {
  const r = await get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]);
  return Number(r.s);
}

// BUG (TEST-ISO-01): ton kho bi tieu het giua cac file test (cung DB) =>
// p2p2 fail "Kho khong du ..." tren PostgreSQL.
test.before(async () => {
  await ensureStockAll(['CF-SUA-01', 'BANH-01', 'TRA-DAO-01'], 500);
});

test('p2p1: receivePO chua duyet bi chan APPROVAL_REQUIRED', async () => {
  const sup = await get("SELECT * FROM suppliers WHERE code='NCC01'");
  const out = await supplyService.createPO(null, { code: `POT-${S}`, supplier_id: sup.id, amount: 12000000, created_by: 'test' });
  poId = out.id;
  await assert.rejects(
    () => supplyService.receivePO(null, poId, { items: [{ sku: 'CF-SUA-01', qty: 5 }], actor: 'test' }),
    (err) => err.code === 'APPROVAL_REQUIRED'
  );
});

test('p2p2: duyet -> receive: stock in + payable (khong INSERT debts truc tiep)', async () => {
  await run("INSERT INTO approvals(ref_type,ref_id,requester,level,status) VALUES('purchase_order',?,1,'manager','approved')", [poId]);
  const before = await stockOf('CF-SUA-01');
  const out = await supplyService.receivePO(null, poId, { items: [{ sku: 'CF-SUA-01', qty: 5 }], actor: 'test' });
  assert.equal(out.status, 'received');
  assert.equal(await stockOf('CF-SUA-01'), before + 5);
  const pay = await get("SELECT * FROM debts WHERE type='payable' AND note LIKE '%POT-%' ORDER BY id DESC LIMIT 1");
  assert.ok(pay && Number(pay.amount) === 12000000, 'phai co payable qua finance.createPayable');
});
