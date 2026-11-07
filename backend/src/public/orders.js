// public/orders.js — P2 checkout web→ERP (khép kín công ty)
// Tuân thủ: giá server resolvePrice, combo explode trừ kho thành phần,
// khử trùng KH, receivable+shipment+ticket qua service sở hữu, lookup token.
const express = require('express');
const crypto = require('crypto');
const { ok, fail, AppError } = require('../common/errors');
const { all, get, tx, insertedId, findByIdOrCode } = require('../common/db');
const { reqStr, reqIntPos } = require('../common/validate');
const { publicOrderLimiter } = require('./limiters');
const { resolvePrice } = require('./price');

const router = express.Router();
// SEC-03/PAY-01 FIX v7: limiter GAN THEO ROUTE — router.use o day se dem ca webhook/lookup/chat
router.use(express.json({ limit: '100kb' }));

function isPhoneVN(s) {
  return /^0\d{9,10}$/.test(String(s || '').trim());
}
function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}
function contactHash(phone, email) {
  return crypto.createHash('sha256').update(String(phone || '').trim().toLowerCase() + '|' + String(email || '').trim().toLowerCase()).digest('hex');
}
function lookupToken() {
  return crypto.randomBytes(24).toString('hex');
}
function sanitize(s, max = 500) {
  return String(s || '').replace(/[<>"']/g, '').trim().slice(0, max);
}

async function findOrCreateCustomer(c, { name, phone, email, address }) {
  const ph = String(phone || '').trim();
  const em = String(email || '').trim().toLowerCase();
  let cust = null;
  if (ph) cust = await c.get('SELECT * FROM customers WHERE phone=?', [ph]);
  if (!cust && em) cust = await c.get('SELECT * FROM customers WHERE lower(email)=?', [em]);
  const hash = contactHash(ph, em);
  if (cust) {
    await c.run('UPDATE customers SET contact_hash=?, email=COALESCE(email,?), address=COALESCE(address,?) WHERE id=?', [hash, email || null, address || null, cust.id]);
    return (await c.get('SELECT * FROM customers WHERE id=?', [cust.id]));
  }
  const code = 'KH-WEB-' + String(Date.now()).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const r = await c.run(
    'INSERT INTO customers(code,name,phone,email,address,type,contact_hash) VALUES(?,?,?,?,?,?,?)',
    [code, sanitize(name, 120), ph || null, em || null, sanitize(address, 300), 'retail', hash]
  );
  const id = insertedId(r, 'customers');
  return c.get('SELECT * FROM customers WHERE id=?', [id]);
}

// POST /api/public/orders — checkout
router.post('/orders', publicOrderLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const name = sanitize(reqStr(body, 'name', { max: 120 }));
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();
    if (!isPhoneVN(phone) && !isEmail(email)) throw new AppError('VALIDATION', 'Can SDT VN (0xxxxxxxxx) hoac email hop le', 400);
    if (phone && !isPhoneVN(phone)) throw new AppError('VALIDATION', 'SDT VN khong hop le', 400);
    if (email && !isEmail(email)) throw new AppError('VALIDATION', 'Email khong hop le', 400);
    const address = sanitize(body.address || '', 300);
    const note = sanitize(body.note || '', 500);
    const payMethod = reqStr(body, 'pay_method', { max: 20 });
    if (!['cash', 'bank', 'ewallet'].includes(payMethod)) throw new AppError('VALIDATION', 'pay_method chi cash/bank/ewallet (COD/VietQR/vi)', 400);
    const items = body.items;
    if (!Array.isArray(items) || !items.length || items.length > 20) throw new AppError('VALIDATION', 'items 1-20 mon', 400);
    const idemKey = String(req.headers['idempotency-key'] || body.idempotency_key || '').slice(0, 64) || null;

    const out = await tx(async (c) => {
      if (idemKey) {
        const dup = await c.get('SELECT * FROM orders WHERE idempotency_key=?', [idemKey]);
        if (dup) {
          const tok = await c.get('SELECT * FROM order_lookup_tokens WHERE order_id=? ORDER BY id DESC LIMIT 1', [dup.id]);
          return { id: dup.id, code: dup.code, amount: Number(dup.amount), status: dup.status, lookup_token: null, deduped: true };
        }
      }
      const cust = await findOrCreateCustomer(c, { name, phone, email, address });
      // Resolve giá + explode combo
      // P1-10: KHONG kiem tra ton thu cong o day — nguon kiem tra ton DUY NHAT
      // la supplyService.moveStock (co lock + kiem tra ton) chay trong cung tx.
      // Kiem tra thu cong co the LECH voi moveStock (race) => oversell.
      let amount = 0;
      const lines = []; // {sku, qty, price, cost, is_parent}
      const stockOuts = []; // {sku, qty(am)}
      for (const it of items) {
        const sku = String(it.sku || '').slice(0, 32);
        const qty = Number(it.qty);
        if (!sku || !Number.isInteger(qty) || qty <= 0 || qty > 100) throw new AppError('VALIDATION', `Item ${sku} qty 1-100`, 400);
        const p = await c.get('SELECT * FROM products WHERE sku=? AND COALESCE(is_published, TRUE) IS TRUE', [sku]);
        if (!p) throw new AppError('NOT_FOUND', `Khong tim thay SKU ${sku}`, 404);
        const pr = await resolvePrice(sku, p.price, 'web');
        amount += Number(pr.price) * qty;
        lines.push({ sku, qty, price: Number(pr.price), cost: Number(p.cost), rule_id: pr.rule_id });
        if (p.is_combo) {
          const parts = await c.query('SELECT * FROM product_combos WHERE parent_sku=?', [sku]);
          if (!parts.length) throw new AppError('VALIDATION', `Combo ${sku} chua cau hinh thanh phan`, 400);
          for (const pt of parts) {
            // Combo tru kho THANH PHAN (khong tru combo cha).
            stockOuts.push({ sku: pt.child_sku, qty: -(Number(pt.qty) * qty) });
          }
        } else {
          stockOuts.push({ sku, qty: -qty });
        }
      }
      if (amount <= 0) throw new AppError('VALIDATION', 'amount phai > 0', 400);
      let status = 'pending';
      if (amount >= 50000000) status = 'pending_approval';
      const { todayVN, businessDayVN, toSqlDateTime } = require('../common/db');
      const code = 'DHW-' + String(Date.now()).slice(-8);
      const lookupCode = code;
      const r = await c.run(
        "INSERT INTO orders(code,customer_id,employee_id,amount,status,order_date,created_by,idempotency_key,source,lookup_code) VALUES(?,?,?,?,?,?,?, ?,?,?)",
        // Phase 1 (P0-1): created_by la BIGINT -> don web khong co user ERP => NULL.
        [code, cust.id, null, amount, status, todayVN(), null, idemKey, 'storefront', lookupCode]
      );
      const orderId = insertedId(r, 'orders');
      for (const ln of lines) {
        await c.run('INSERT INTO order_items(order_id,product_sku,qty,price,cost) VALUES(?,?,?,?,?)', [orderId, ln.sku, ln.qty, ln.price, ln.cost]);
      }
      const supplyService = require('../modules/supply/service');
      const financeService = require('../modules/finance/service');
      // P1-10: (d) DAT TRUOC TON KHO — nguon kiem tra ton DUY NHAT.
      //   moveStock khoa dong theo SKU + nem STOCK_SHORTAGE (409) neu thieu;
      //   tx rollback toan bo => khong tao don thieu hang.
      //   Gom theo SKU (tru 2 dong cung SKU) + sap xep ALPHABET de thu tu
      //   khoa on dinh (tranh deadlock tren PostgreSQL).
      const agg = new Map();
      for (const so of stockOuts) {
        agg.set(so.sku, Number(agg.get(so.sku) || 0) + Number(so.qty));
      }
      const sortedOuts = [...agg.entries()]
        .map(([sku, qty]) => ({ sku, qty }))
        .sort((a, b) => a.sku.localeCompare(b.sku));
      for (const so of sortedOuts) {
        await supplyService.moveStock(c, { sku: so.sku, type: 'out', qty: so.qty, ref_code: code, created_by: null, actor: 'storefront', idempotency_key: idemKey ? `stk-${idemKey}-${so.sku}` : null });
      }
      // Phase 0.5: due_date = ngay VN + 7.
      await financeService.createReceivable(c, { customer_id: cust.id, order_id: orderId, amount, due_date: businessDayVN(7), created_by: null, actor: 'storefront', note: `Cong no ${code} (${payMethod})` });
      await supplyService.createShipment(c, { order_id: orderId, created_by: null, actor: 'storefront' });
      // Ticket CSKH liên kết đơn (helpdesk sở hữu tickets)
      const hd = require('../modules/helpdesk/service');
      const tck = await hd.createTicket(c, { customer_id: cust.id, category: 'easy', subject: `Don web ${code}`, content: `KH ${name} ${phone} dat ${lines.map(l => l.sku + 'x' + l.qty).join(', ')} — ${note}`.slice(0, 500), priority: 'normal', actor: 'storefront' });
      try { await c.run('UPDATE tickets SET order_id=? WHERE id=?', [orderId, tck.id]); } catch {}
      const { writeAudit } = require('../common/audit');
      await writeAudit(c, 'storefront', 'create', 'orders', orderId, null, { code, amount, status, source: 'storefront' });
      // Lookup token phụ (30 ngày) — Phase 0.6: dinh dang timestamp thong nhat.
      const rawTok = lookupToken();
      const tokHash = crypto.createHash('sha256').update(rawTok).digest('hex');
      await c.run('INSERT INTO order_lookup_tokens(order_id,token_hash,expires_at) VALUES(?,?,?)', [orderId, tokHash, toSqlDateTime(new Date(Date.now() + 30 * 86400000))]);
      return { id: orderId, code, amount, status, lookup_token: rawTok, ticket: tck.code, customer_id: cust.id };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

// POST /api/public/service-requests — đặt lịch/báo giá chi tiết (teabreak)
router.post('/service-requests', publicOrderLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const serviceCode = reqStr(body, 'service_id', { max: 32 });
    const name = sanitize(reqStr(body, 'name', { max: 120 }));
    const phone = String(body.phone || '').trim();
    if (!isPhoneVN(phone)) throw new AppError('VALIDATION', 'SDT VN khong hop le', 400);
    const email = body.email ? String(body.email).trim() : null;
    if (email && !isEmail(email)) throw new AppError('VALIDATION', 'Email khong hop le', 400);
    const slotTime = body.slot_time ? String(body.slot_time).slice(0, 32) : null;
    if (slotTime) {
      const t = new Date(slotTime.replace(' ', 'T'));
      if (isNaN(t.getTime()) || t.getTime() <= Date.now()) throw new AppError('VALIDATION', 'slot_time phai tuong lai', 400);
    }
    const partySize = body.party_size != null ? Number(body.party_size) : null;
    if (partySize != null && (!Number.isInteger(partySize) || partySize <= 0 || partySize > 1000)) throw new AppError('VALIDATION', 'party_size 1-1000', 400);
    const location = sanitize(body.location || '', 300);
    const taxCode = body.tax_code ? String(body.tax_code).trim() : null;
    if (taxCode && !/^\d{10}(-\d{3})?$/.test(taxCode)) throw new AppError('VALIDATION', 'MST 10 hoac 13 so', 400);
    const note = sanitize(body.note || '', 500);
    const out = await tx(async (c) => {
      // PG-DB-07: `services.id` la BIGINT. Bind 'DV-TEABREAK' (ma dich vu,
      // TEXT) vao cot `id` -> PG nem "invalid input syntax for type bigint".
      // => tra cuu an toan theo id (so) HOAC code (chuoi).
      const svc = await findByIdOrCode(c, 'services', serviceCode, {
        cols: 'id, code, name, type, price, unit, description, is_published',
      });
      if (!svc) throw new AppError('NOT_FOUND', 'Khong tim thay dich vu', 404);
      // Giu nguyen semantics cua cau lenh goc: COALESCE(is_published, TRUE) IS TRUE
      // (dich vu chua publish -> 404, nhu truoc).
      if (svc.is_published === false || svc.is_published === 0) {
        throw new AppError('NOT_FOUND', 'Khong tim thay dich vu', 404);
      }
      let cust = await c.get('SELECT * FROM customers WHERE phone=?', [phone]);
      if (!cust) {
        const code = 'KH-WEB-' + String(Date.now()).slice(-6) + Math.floor(Math.random() * 90 + 10);
        const r = await c.run('INSERT INTO customers(code,name,phone,email,type,contact_hash) VALUES(?,?,?,?,?,?)', [code, name, phone, email, 'retail', contactHash(phone, email)]);
        const id = insertedId(r, 'customers');
        cust = await c.get('SELECT * FROM customers WHERE id=?', [id]);
      }
      const reqCode = 'SRV-' + String(Date.now()).slice(-8);
      const r = await c.run(
        'INSERT INTO service_requests(code,service_id,customer_id,name,phone,email,slot_time,party_size,location,tax_code,note,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        [reqCode, svc.id, cust.id, name, phone, email, slotTime, partySize, location || null, taxCode, note || null, 'new']
      );
      const id = insertedId(r, 'service_requests');
      const hd = require('../modules/helpdesk/service');
      const tck = await hd.createTicket(c, { customer_id: cust.id, category: 'policy_inquiry', subject: `Dat lich ${svc.code} ${reqCode}`, content: `${name} ${phone} slot ${slotTime || 'lien he'} x${partySize || '?'} @${location || '?'} MST:${taxCode || '-'} — ${note}`.slice(0, 500), priority: 'normal', actor: 'storefront' });
      const { writeAudit } = require('../common/audit');
      await writeAudit(c, 'storefront', 'create', 'service_requests', id, null, { code: reqCode, service: svc.code });
      return { id, code: reqCode, service: svc.code, ticket: tck.code };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

module.exports = router;
