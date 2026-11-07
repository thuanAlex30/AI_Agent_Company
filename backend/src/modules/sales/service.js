const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { setBusinessScope, resolveResourceDept } = require('../../common/scope');

const ORDER_FLOW = ['draft', 'pending_approval', 'pending', 'approved', 'in_progress', 'done', 'paid', 'partial', 'cancelled', 'refunded'];

async function withTx(fn, conn) {
  const db = require('../../common/db');
  if (conn && typeof conn.run === 'function') return fn(conn);
  return db.tx(fn);
}

// TX-02: doc ton kho co khoa dong hang theo SKU (chi tiet: supply/service.js).
//   - Buoc 1: khoa ROW product (FOR UPDATE tren PG) -> mutex theo SKU.
//   - Buoc 2: cong stock_moves (append-only).
//   - SQLite: tx serialize toan bo (TX-01) -> doc+ghi trong cung tx van atomic.
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
async function createOrder(conn, { code, customer_id, items, employee_id = null, created_by = null, actor = null, idempotency_key = null, contract_id = null }) {
  return withTx(async (c) => {
    if (!code || !customer_id || !Array.isArray(items) || items.length === 0) {
      throw new AppError('VALIDATION', 'Don can code + customer + items', 400);
    }
    if (idempotency_key) {
      const dup = await c.get('SELECT * FROM orders WHERE idempotency_key=?', [idempotency_key]);
      if (dup) return { id: dup.id, deduped: true };
    }
    const cust = await c.get('SELECT * FROM customers WHERE id=?', [customer_id]);
    if (!cust) throw new AppError('NOT_FOUND', 'Khong tim thay khach hang', 404);
    let amount = 0;
    // TX-02: khoa tat ca SKU theo thu tu alphabet de tranh deadlock khi
    // 2 don cung chay song song (PG: SELECT ... FOR UPDATE).
    // Ton kho da dung cho SKU trong chinh don nay phai duoc truong truoc
    // (truong hop 1 SKU xuat hien nhieu dong trong items).
    const sorted = [...items].sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
    const reserved = new Map();
    for (const it of sorted) {
      const p = await c.get('SELECT * FROM products WHERE sku=?', [it.sku]);
      if (!p) throw new AppError('NOT_FOUND', `Khong tim thay SKU ${it.sku}`, 404);
      if (!it.qty || it.qty <= 0) throw new AppError('VALIDATION', 'qty phai > 0', 400);
      // TX-02: ton kho phai duoc kiem tra + ghi trong cung transaction,
      // kem khoa dong hang theo SKU de tranh oversell khi 2 don cung chay
      // song song (ca 2 deu thay ton du truoc khi ghi).
      const onhand = await readOnhand(c, it.sku);
      const already = Number(reserved.get(it.sku) || 0);
      if (Number(onhand) - already < Number(it.qty)) {
        throw new AppError('STOCK_SHORTAGE', `Kho khong du ${it.sku} (ton ${onhand})`, 409);
      }
      reserved.set(it.sku, already + Number(it.qty));
      amount += Number(p.price) * Number(it.qty);
    }
    if (amount <= 0) throw new AppError('VALIDATION', 'amount phai > 0', 400);
    // cong duyet: contract >=50tr hoac don >=50tr -> pending_approval
    let status = 'pending';
    if (contract_id) {
      const ct = await c.get('SELECT * FROM contracts WHERE id=?', [contract_id]);
      if (!ct) throw new AppError('NOT_FOUND', 'Khong tim thay hop dong', 404);
      if (ct.status !== 'signed') status = 'pending_approval';
      else if (amount >= 50000000) status = 'pending_approval';
    } else if (amount >= 50000000) {
      status = 'pending_approval';
    }
    const { todayVN } = require('../../common/db');
    // TX-04: 2 request cung idempotency_key chay song song deu qua CHECK
    // o tren (SELECT) -> ca 2 cung INSERT -> 1 bi loi UNIQUE.
    // Bat loi unique -> tra ve ban ghi da ton tai (idempotent retry).
    let r;
    try {
      r = await c.run(
        'INSERT INTO orders(code,customer_id,contract_id,employee_id,amount,status,order_date,created_by,idempotency_key) VALUES(?,?,?,?,?,?,?, ?,?)',
        [code, customer_id, contract_id, employee_id, amount, status, todayVN(), created_by, idempotency_key]
      );
    } catch (e) {
      if (idempotency_key && require('../../common/db').isUniqueViolation(e)) {
        const dup = await c.get('SELECT * FROM orders WHERE idempotency_key=?', [idempotency_key]);
        if (dup) return { id: dup.id, amount: Number(dup.amount), status: dup.status, deduped: true };
      }
      throw e;
    }
    const orderId = r.lastInsertRowid || (await c.get('SELECT id FROM orders WHERE code=?', [code]))?.id;
    // Phase 3 (P0-4): gan phong ban cho don (de scope list + IDOR check hoat dong).
    const orderDept = await resolveResourceDept(c, 'orders', { ownerEmployeeId: employee_id });
    await setBusinessScope(c, 'orders', orderId, orderDept, employee_id);
    for (const it of items) {
      const p = await c.get('SELECT price, cost FROM products WHERE sku=?', [it.sku]);
      await c.run('INSERT INTO order_items(order_id,product_sku,qty,price,cost) VALUES(?,?,?,?,?)', [orderId, it.sku, it.qty, p.price, p.cost]);
    }
    await writeAudit(c, actor || 'system', 'create', 'orders', orderId, null, { code, amount, status });
    // qua module khac bang service (giu bien ownership)
    const supplyService = require('../supply/service');
    const financeService = require('../finance/service');
    for (const it of items) {
      await supplyService.moveStock(c, { sku: it.sku, type: 'out', qty: -Math.abs(it.qty), ref_code: code, created_by, actor, idempotency_key: idempotency_key ? `stk-${idempotency_key}-${it.sku}` : null });
    }
    // Phase 0.5: due_date = ngay VN + 7 (khong di qua Date/UTC).
    const { businessDayVN } = require('../../common/db');
    await financeService.createReceivable(c, { customer_id, order_id: orderId, amount, due_date: businessDayVN(7), created_by, actor, note: `Cong no ${code}` });
    await supplyService.createShipment(c, { order_id: orderId, created_by, actor, dept: orderDept });
    return { id: orderId, amount, status };
  }, conn);
}

async function setOrderPaid(conn, orderId, actor) {
  return withTx(async (c) => {
    const o = await c.get('SELECT * FROM orders WHERE id=?', [orderId]);
    if (!o) throw new AppError('NOT_FOUND', 'Khong tim thay don', 404);
    if (['cancelled', 'refunded', 'draft'].includes(o.status)) return { id: orderId, status: o.status };
    const s = await c.get('SELECT COALESCE(SUM(amount),0) sum FROM payments WHERE order_id=?', [orderId]);
    const paidSum = Number(s?.sum || 0);
    let ns = o.status;
    if (paidSum >= Number(o.amount) && Number(o.amount) > 0) ns = 'paid';
    else if (paidSum > 0) ns = 'partial';
    if (ns !== o.status) {
      await c.run('UPDATE orders SET status=? WHERE id=?', [ns, orderId]);
      await writeAudit(c, actor || 'system', 'update', 'orders', orderId, { status: o.status }, { status: ns });
    }
    return { id: orderId, status: ns, paidSum };
  }, conn);
}

async function cancelOrder(conn, orderId, actor, actor_id = null) {
  return withTx(async (c) => {
    const o = await c.get('SELECT * FROM orders WHERE id=?', [orderId]);
    if (!o) throw new AppError('NOT_FOUND', 'Khong tim thay don', 404);
    const pay = await c.get('SELECT COUNT(*) c FROM payments WHERE order_id=?', [orderId]);
    if (Number(pay?.c || 0) > 0) throw new AppError('VALIDATION', 'Don da co payment — phai refund, khong duoc cancel', 400);
    if (!['draft', 'pending_approval', 'pending', 'approved', 'in_progress'].includes(o.status)) {
      throw new AppError('VALIDATION', `Trang thai ${o.status} khong duoc cancel`, 400);
    }
    const items = await c.query('SELECT * FROM order_items WHERE order_id=?', [orderId]);
    const supplyService = require('../supply/service');
    const financeService = require('../finance/service');
    for (const it of items) {
      await supplyService.moveStock(c, { sku: it.product_sku, type: 'in', qty: Math.abs(it.qty), ref_code: `CANCEL-${o.code}`, created_by: actor_id, actor });
    }
    await c.run('UPDATE orders SET status=? WHERE id=?', ['cancelled', orderId]);
    await financeService.markDebtCancelled(c, orderId, actor);
    await writeAudit(c, actor || 'system', 'update', 'orders', orderId, { status: o.status }, { status: 'cancelled' });
    return { id: orderId, status: 'cancelled' };
  }, conn);
}

async function refundOrder(conn, orderId, actor, actor_id = null) {
  return withTx(async (c) => {
    const o = await c.get('SELECT * FROM orders WHERE id=?', [orderId]);
    if (!o) throw new AppError('NOT_FOUND', 'Khong tim thay don', 404);
    if (!['paid', 'partial'].includes(o.status)) throw new AppError('VALIDATION', 'Chi refund don paid/partial', 400);
    const financeService = require('../finance/service');
    const supplyService = require('../supply/service');
    const debts = await c.query('SELECT * FROM debts WHERE order_id=? AND type=\'receivable\'', [orderId]);
    for (const d of debts) {
      if (Number(d.paid) > 0) {
        await financeService.recordPayment(c, { debt_id: d.id, order_id: orderId, amount: -Number(d.paid), method: 'cash', actor, note: `Refund ${o.code}` });
      }
    }
    const items = await c.query('SELECT * FROM order_items WHERE order_id=?', [orderId]);
    for (const it of items) {
      await supplyService.moveStock(c, { sku: it.product_sku, type: 'in', qty: Math.abs(it.qty), ref_code: `REFUND-${o.code}`, created_by: actor_id, actor });
    }
    await c.run('UPDATE orders SET status=? WHERE id=?', ['refunded', orderId]);
    await financeService.markDebtCancelled(c, orderId, actor);
    await writeAudit(c, actor || 'system', 'update', 'orders', orderId, { status: o.status }, { status: 'refunded' });
    return { id: orderId, status: 'refunded' };
  }, conn);
}

async function convertLead(conn, leadId, actor) {
  return withTx(async (c) => {
    const lead = await c.get('SELECT * FROM leads WHERE id=?', [leadId]);
    if (!lead) throw new AppError('NOT_FOUND', 'Khong tim thay lead', 404);
    if (lead.stage === 'won' || lead.stage === 'lost') throw new AppError('VALIDATION', 'Lead da chot', 400);
    const code = `KH-${String(Date.now()).slice(-6)}-${leadId}`;
    let customerId;
    const exist = await c.get('SELECT * FROM customers WHERE phone=?', [lead.phone]);
    if (exist) customerId = exist.id;
    else {
      const r = await c.run('INSERT INTO customers(code,name,phone,type,owner_employee_id) VALUES(?,?,?,?,?)', [code, lead.name, lead.phone, 'retail', lead.owner_employee_id]);
      customerId = r.lastInsertRowid || (await c.get('SELECT id FROM customers WHERE code=?', [code]))?.id;
      // Phase 3: gan phong ban cho KH vua tao.
      const custDept = await resolveResourceDept(c, 'customers', { ownerEmployeeId: lead.owner_employee_id });
      await setBusinessScope(c, 'customers', customerId, custDept, lead.owner_employee_id);
    }
    await c.run('UPDATE leads SET stage=? WHERE id=?', ['won', leadId]);
    await writeAudit(c, actor || 'system', 'update', 'leads', leadId, { stage: lead.stage }, { stage: 'won', customer_id: customerId });
    return { customer_id: customerId, lead_id: leadId };
  }, conn);
}

module.exports = { createOrder, setOrderPaid, cancelOrder, refundOrder, convertLead, ORDER_FLOW };
