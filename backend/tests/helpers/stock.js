// helpers/stock.js — tien ich dam bao ton kho cho test.
//
// BUG (TEST-ISO-01): ton kho trong DB test seed chi co:
//     CF-SUA-01: 100 - 50 = 50
//     TRA-DAO-01: 80 - 30 = 50
//     BANH-01:    25 - 20 = 5     <-- rat it
//Nhieu file test (public-write, phase4, order-stock-debt, p2p, payments,
//approval) tao don / xuat kho tren CUNG DB (dung chung `bizops_test`).
// => Ton kho bi TIEU het dan => test sau fail "Kho khong du ... (ton 0)".
//
// Trieu chung:
//   - tren SQLite: ton con lai (nhieu test da tieu) => PASS tinh hoi
//   - tren PostgreSQL: DB seed it hon => FAIL
// => test phai TU LAM CHU "dam bao ton kho" truoc khi can.
//
// Ham nay ghi bang `stock_moves` (append-only, INSERT la OK) => khong vo
// pham vi va khong noi long quyen.
const db = require('../../src/common/db');

/** Ton kho hien tai cua 1 SKU. */
async function stockOf(sku, conn) {
  const c = conn || db;
  const r = await c.get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]);
  return Number(r?.s || 0);
}

/**
 * Dam bao ton kho cua SKU >= `qty` (nap them neu thieu).
 * @returns {Promise<number>} ton kho sau khi nap.
 */
async function ensureStock(sku, qty = 500, conn) {
  const on = await stockOf(sku, conn);
  if (on >= qty) return on;
  const supplyService = require('../../src/modules/supply/service');
  try {
    await supplyService.moveStock(conn || null, {
      sku, type: 'in', qty: qty - on, ref_code: 'TEST-SEED', created_by: null, actor: 'test',
    });
  } catch (e) {
    // Trigger append-only / FK co the chan -> khong lam fail test goc,
    // nhung phai bao loi lai de debug.
    if (!/append-only/i.test(String(e.message || ''))) throw e;
  }
  return await stockOf(sku, conn);
}

/** Nap ton kho cho nhieu SKU. */
async function ensureStockAll(skus = ['CF-SUA-01', 'BANH-01', 'TRA-DAO-01'], qty = 500) {
  for (const sku of skus) await ensureStock(sku, qty);
}

module.exports = { stockOf, ensureStock, ensureStockAll };
