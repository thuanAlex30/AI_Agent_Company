// public/lookup.js — P3 tra cứu đơn 2 yếu tố (mã DHxxx + SĐT/email, hoặc X-Lookup-Token)
// Chống dò quét: rate-limit + delay đều + 404 chung. Chỉ trả status/timeline/remain.
const express = require('express');
const crypto = require('crypto');
const { ok, fail } = require('../common/errors');
const { get, all } = require('../common/db');
const { nowISO } = require('../common/db');
const { businessDayVN } = require('../common/db');
const { publicLookupLimiter } = require('./limiters');

const router = express.Router();
// SEC-03/PAY-01 FIX v7: limiter GAN THEO ROUTE — router.use se dem ca webhook/orders/chat
router.use(express.json({ limit: '100kb' }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normContact(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, '');
}

async function buildTimeline(orderId, orderStatus) {
  const ships = await all('SELECT * FROM shipments WHERE order_id=? ORDER BY id DESC LIMIT 3', [orderId]);
  const ship = ships[0] || null;
  // Map ERP status -> bước web
  const steps = ['received', 'approved', 'making', 'shipping', 'done'];
  let idx = 0;
  if (['pending_approval', 'pending', 'approved'].includes(orderStatus)) idx = orderStatus === 'pending_approval' ? 0 : 1;
  else if (orderStatus === 'in_progress') idx = 2;
  else if (['paid', 'partial', 'done'].includes(orderStatus)) idx = 4;
  if (ship) {
    if (ship.status === 'shipping') idx = Math.max(idx, 3);
    else if (ship.status === 'done') idx = 4;
    else if (ship.status === 'failed') idx = 3;
  }
  if (['cancelled', 'refunded'].includes(orderStatus)) {
    return { steps: steps.map((s, i) => ({ key: s, done: false })), current: orderStatus, cancelled: true };
  }
  return { steps: steps.map((s, i) => ({ key: s, done: i <= idx })), current: steps[idx], cancelled: false };
}

router.get('/orders/:code', publicLookupLimiter, async (req, res) => {
  const t0 = Date.now();
  try {
    const code = String(req.params.code || '').slice(0, 32).trim();
    const contact = normContact(req.query.contact || req.headers['x-contact'] || '');
    const token = String(req.headers['x-lookup-token'] || '').slice(0, 128);
    const order = await get('SELECT * FROM orders WHERE code=? OR lookup_code=?', [code, code]);
    let authed = false;
    let customer = null;
    if (order) {
      customer = await get('SELECT * FROM customers WHERE id=?', [order.customer_id]);
      if (token) {
        const h = crypto.createHash('sha256').update(token).digest('hex');
        const row2 = await get('SELECT * FROM order_lookup_tokens WHERE order_id=? AND token_hash=? AND expires_at > ?', [order.id, h, nowISO()]);
        if (row2) authed = true;
      } else if (contact) {
        const ph = (customer?.phone || '').trim();
        const em = (customer?.email || '').trim().toLowerCase();
        if (ph && normContact(ph) === contact) authed = true;
        else if (em && normContact(em) === contact) authed = true;
      }
    }
    // Delay đều ~300ms chống timing-attack
    const elapsed = Date.now() - t0;
    if (elapsed < 300) await sleep(300 - elapsed);
    if (!order || !authed) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Khong tim thay don' } });
    }
    const debts = await all("SELECT * FROM debts WHERE order_id=? AND type='receivable'", [order.id]);
    const amount = Number(order.amount);
    const paid = debts.reduce((s, d) => s + Number(d.paid || 0), 0);
    const remain = Math.max(0, amount - paid);
    const ships = await all('SELECT id, carrier, tracking_code, status, ship_fee FROM shipments WHERE order_id=? ORDER BY id DESC LIMIT 1', [order.id]);
    const timeline = await buildTimeline(order.id, order.status);
    return ok(res, {
      code: order.code,
      status: order.status,
      amount,
      paid,
      remain,
      order_date: order.order_date,
      shipment: ships[0] ? { carrier: ships[0].carrier, status: ships[0].status, ship_fee: Number(ships[0].ship_fee || 0) } : null,
      timeline,
    });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
