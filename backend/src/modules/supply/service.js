const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { setBusinessScope, resolveResourceDept } = require('../../common/scope');

async function withTx(fn, conn) {
  const db = require('../../common/db');
  if (conn && typeof conn.run === 'function') return fn(conn);
  return db.tx(fn);
}

// NOTE: supply so huu products/purchase_orders/shipments/stock_moves/sop_tasks/suppliers.
// Payable di qua financeService.createPayable (khong INSERT bang cua finance).

// TX-02: doc ton kho co khoa dong hang.
//   - Buoc 1: khoa ROW cua product (SELECT ... FROM products WHERE sku=? FOR UPDATE).
//     Day la "mutex" theo SKU: moi giao dich ghi ton kho cung SKU se cho
//     den khi transaction truoc release -> khong con oversell.
//   - Buoc 2: tinh tong ton kho tu stock_moves (append-only).
//   - SQLite: khong co row lock -> tx da serialize toan bo (TX-01) nen
//     read+write trong cung transaction van atomic.
async function readOnhand(c, sku) {
  if (typeof c.lock === 'function') {
    await c.lock('SELECT sku FROM products WHERE sku=?', [sku]);
  }
  const row = await c.get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]);
  return Number(row?.s || 0);
}

// Phase 1 (P0-1): quy uoc moi cho signature:
//   - `created_by` = ID NGUOI (SO) -> cot BIGINT
//   - `actor`      = USERNAME (TEXT) -> audit_log.actor
// Mac dinh created_by = null (nghiep vu tu dong: cron/webhook/storefront).
async function moveStock(conn, { sku, type, qty, ref_code = null, created_by = null, actor = null, idempotency_key = null }) {
  return withTx(async (c) => {
    if (!sku || !type || !qty) throw new AppError('VALIDATION', 'moveStock can sku+type+qty', 400);
    if (!['in', 'out', 'adjust'].includes(type)) throw new AppError('VALIDATION', 'type kho khong hop le', 400);
    if (type === 'in' && qty <= 0) throw new AppError('VALIDATION', 'in phai qty>0', 400);
    if (type === 'out' && qty >= 0) throw new AppError('VALIDATION', 'out phai qty<0', 400);
    if (type === 'adjust' && qty === 0) throw new AppError('VALIDATION', 'adjust phai qty!=0', 400);
    if (idempotency_key) {
      const dup = await c.get('SELECT * FROM stock_moves WHERE idempotency_key=?', [idempotency_key]);
      if (dup) return { id: dup.id, deduped: true };
    }
    if (type === 'out') {
      // TX-02: khoa doc ton kho (FOR UPDATE tren PG) de tranh oversell.
      // Doc + ghi phai nam trong CUNG transaction, va doc phai co lock
      // thi moi atomic voi concurrent "out" cua SKU cung.
      const onhand = await readOnhand(c, sku);
      if (Number(onhand) + Number(qty) < 0) throw new AppError('STOCK_SHORTAGE', `Kho khong du ${sku} (ton ${onhand})`, 409);
    }
    const r = await c.run(
      'INSERT INTO stock_moves(product_sku,type,qty,ref_code,created_by,idempotency_key) VALUES(?,?,?,?,?,?)',
      [sku, type, qty, ref_code, created_by, idempotency_key]
    );
    const id = r.lastInsertRowid || (await c.get('SELECT id FROM stock_moves WHERE product_sku=? ORDER BY id DESC LIMIT 1', [sku]))?.id;
    // Phase 3: stock_moves thuoc phong ban supply.
    await setBusinessScope(c, 'stock_moves', id, 'supply');
    await writeAudit(c, actor || 'system', 'create', 'stock_moves', id, null, { sku, type, qty, ref_code });
    return { id };
  }, conn);
}

async function createShipment(conn, { order_id, carrier = null, created_by = null, actor = null, dept = null }) {
  return withTx(async (c) => {
    const o = await c.get('SELECT * FROM orders WHERE id=?', [order_id]);
    if (!o) throw new AppError('NOT_FOUND', 'Khong tim thay don', 404);
    const ex = await c.get('SELECT * FROM shipments WHERE order_id=? ORDER BY id DESC LIMIT 1', [order_id]);
    if (ex && ['pending', 'shipping'].includes(ex.status)) return { id: ex.id, deduped: true };
    const r = await c.run("INSERT INTO shipments(order_id,carrier,status,ship_fee,attempt) VALUES(?,?,'pending',0,1)", [order_id, carrier]);
    const id = r.lastInsertRowid || (await c.get('SELECT id FROM shipments WHERE order_id=? ORDER BY id DESC LIMIT 1', [order_id]))?.id;
    // Phase 3: shipment theo don (neu co) — fallback supply.
    const shipDept = dept || await resolveResourceDept(c, 'shipments', { orderId: order_id });
    await setBusinessScope(c, 'shipments', id, shipDept);
    await writeAudit(c, actor || 'system', 'create', 'shipments', id, null, { order_id });
    return { id };
  }, conn);
}

const SHIP_FLOW = { pending: ['shipping', 'cancelled'], shipping: ['done', 'failed', 'cancelled'], failed: ['shipping', 'cancelled'] };

async function setShipment(conn, id, { status, tracking_code = null, carrier = null }, actor) {
  return withTx(async (c) => {
    const s = await c.get('SELECT * FROM shipments WHERE id=?', [id]);
    if (!s) throw new AppError('NOT_FOUND', 'Khong tim thay van don', 404);
    if (!(SHIP_FLOW[s.status] || []).includes(status)) throw new AppError('VALIDATION', `Chuyen ${s.status}->${status} khong hop le`, 400);
    const attempt = status === 'shipping' && s.status === 'failed' ? Number(s.attempt) + 1 : s.attempt;
    await c.run('UPDATE shipments SET status=?, tracking_code=COALESCE(?,tracking_code), carrier=COALESCE(?,carrier), attempt=? WHERE id=?', [status, tracking_code, carrier, attempt, id]);
    await writeAudit(c, actor || 'system', 'update', 'shipments', id, { status: s.status }, { status });
    // done khi moi shipments done + qa pass -> service khac quyet; o day chi cap nhat van don
    return { id, status };
  }, conn);
}

async function createPO(conn, { code, supplier_id = null, amount, need_date = null, created_by = null, actor = null, idempotency_key = null }) {
  return withTx(async (c) => {
    if (!code || !amount || amount <= 0) throw new AppError('VALIDATION', 'PO can code + amount>0', 400);
    if (idempotency_key) {
      const dup = await c.get('SELECT * FROM purchase_orders WHERE idempotency_key=?', [idempotency_key]);
      if (dup) return { id: dup.id, deduped: true };
    }
    const r = await c.run(
      "INSERT INTO purchase_orders(code,supplier_id,amount,status,need_date,created_by,idempotency_key) VALUES(?, ?,?, 'draft',?,?,?)",
      [code, supplier_id, amount, need_date, created_by, idempotency_key]
    );
    const id = r.lastInsertRowid || (await c.get('SELECT id FROM purchase_orders WHERE code=?', [code]))?.id;
    // Phase 3: PO thuoc phong ban supply.
    await setBusinessScope(c, 'purchase_orders', id, 'supply');
    await writeAudit(c, actor || 'system', 'create', 'purchase_orders', id, null, { code, amount });
    return { id };
  }, conn);
}

async function receivePO(conn, id, { items = [], actor = null, actor_id = null }) {
  return withTx(async (c) => {
    const po = await c.get('SELECT * FROM purchase_orders WHERE id=?', [id]);
    if (!po) throw new AppError('NOT_FOUND', 'Khong tim thay PO', 404);
    if (po.status !== 'approved' && po.status !== 'sent') {
      const appr = await c.get("SELECT * FROM approvals WHERE ref_type='purchase_order' AND ref_id=? AND status='approved' ORDER BY id DESC LIMIT 1", [id]);
      if (!appr) throw new AppError('APPROVAL_REQUIRED', 'PO chua duyet (can approval approved)', 403);
    }
    for (const it of (items || [])) {
      await moveStock(c, { sku: it.sku, type: 'in', qty: Math.abs(it.qty), ref_code: po.code, created_by: actor_id, actor });
    }
    await c.run("UPDATE purchase_orders SET status='received' WHERE id=?", [id]);
    await writeAudit(c, actor || 'system', 'update', 'purchase_orders', id, { status: po.status }, { status: 'received' });
    // payable qua module finance (giu bien ownership)
    const financeService = require('../finance/service');
    await financeService.createPayable(c, { order_id: null, amount: Number(po.amount), created_by: actor_id, actor, note: `Payable ${po.code}` });
    return { id, status: 'received' };
  }, conn);
}

module.exports = { moveStock, createShipment, setShipment, createPO, receivePO, SHIP_FLOW };
