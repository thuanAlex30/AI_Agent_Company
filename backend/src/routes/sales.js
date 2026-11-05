const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run, tx } = require('../common/db');
const { reqStr, reqIntPos, reqCode } = require('../common/validate');
const salesService = require('../modules/sales/service');

const router = express.Router();
router.use(authenticate);

// customers
router.get('/customers', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM customers ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/customers', requirePerm('customers.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const name = reqStr(req.body, 'name', { max: 200 });
    const phone = reqStr(req.body, 'phone', { optional: true, max: 20 });
    const type = reqStr(req.body, 'type', { optional: true, enum: ['retail', 'wholesale', 'enterprise'] }) || 'retail';
    const r = await run('INSERT INTO customers(code,name,phone,type) VALUES(?,?,?,?)', [code, name, phone || null, type]);
    const id = r.lastInsertRowid || (await get('SELECT id FROM customers WHERE code=?', [code]))?.id;
    const { writeAudit } = require('../common/audit');
    await writeAudit(null, req.user.username, 'create', 'customers', id, null, { code, name });
    return ok(res, { id, code });
  } catch (e) { return fail(res, e); }
});
router.get('/customers/:id', requirePerm('orders.read'), async (req, res) => {
  try {
    const row = await get('SELECT * FROM customers WHERE id=?', [req.params.id]);
    if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay KH', 404);
    return ok(res, row);
  } catch (e) { return fail(res, e); }
});

// leads
router.get('/leads', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM leads ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/leads', requirePerm('leads.write'), async (req, res) => {
  try {
    const name = reqStr(req.body, 'name', { max: 200 });
    const phone = reqStr(req.body, 'phone', { max: 20 });
    const r = await run('INSERT INTO leads(name,phone,source,stage) VALUES(?,?,?,?)', [name, phone, req.body.source || null, 'new']);
    const id = r.lastInsertRowid || (await get('SELECT id FROM leads WHERE phone=? ORDER BY id DESC LIMIT 1', [phone]))?.id;
    return ok(res, { id });
  } catch (e) { return fail(res, e); }
});
router.post('/leads/:id/convert', requirePerm('leads.write'), async (req, res) => {
  try { return ok(res, await salesService.convertLead(null, req.params.id, req.user.username)); }
  catch (e) { return fail(res, e); }
});

// quotes
router.get('/quotes', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM quotes ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/quotes', requirePerm('quotes.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const amount = reqIntPos(req.body, 'amount');
    const r = await run('INSERT INTO quotes(code,lead_id,customer_id,amount,status,created_by) VALUES(?,?,?,?,?,?)',
      [code, req.body.lead_id || null, req.body.customer_id || null, amount, 'draft', req.user.username]);
    const id = r.lastInsertRowid || (await get('SELECT id FROM quotes WHERE code=?', [code]))?.id;
    return ok(res, { id, code });
  } catch (e) { return fail(res, e); }
});

// contracts
router.get('/contracts', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM contracts ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/contracts', requirePerm('quotes.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const amount = reqIntPos(req.body, 'amount');
    const customer_id = reqIntPos(req.body, 'customer_id');
    const r = await run('INSERT INTO contracts(code,customer_id,quote_id,amount,status,created_by) VALUES(?,?,?,?,?,?)',
      [code, customer_id, req.body.quote_id || null, amount, 'draft', req.user.username]);
    const id = r.lastInsertRowid || (await get('SELECT id FROM contracts WHERE code=?', [code]))?.id;
    return ok(res, { id, code });
  } catch (e) { return fail(res, e); }
});
router.post('/contracts/:id/submit-approval', requirePerm('quotes.write'), async (req, res) => {
  try {
    const ct = await get('SELECT * FROM contracts WHERE id=?', [req.params.id]);
    if (!ct) throw new AppError('NOT_FOUND', 'Khong tim thay hop dong', 404);
    const level = Number(ct.amount) >= 50000000 ? 'ceo' : 'manager';
    await tx(async (c) => {
      await c.run('UPDATE contracts SET status=? WHERE id=?', ['pending_approval', ct.id]);
      await c.run('INSERT INTO approvals(ref_type,ref_id,requester,level,status) VALUES(?,?,?,?,?)',
        ['contract', ct.id, req.user.id, level, 'pending']);
      if (Number(ct.amount) >= 50000000) {
        await c.run('INSERT INTO approvals(ref_type,ref_id,requester,level,status) VALUES(?,?,?,?,?)',
          ['contract', ct.id, req.user.id, 'legal', 'pending']);
      }
    });
    return ok(res, { id: ct.id, status: 'pending_approval', level });
  } catch (e) { return fail(res, e); }
});

// orders
router.get('/orders', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM orders ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/orders', requirePerm('orders.write'), async (req, res) => {
  try {
    const key = req.headers['idempotency-key'] || req.body.idempotency_key || null;
    return ok(res, await salesService.createOrder(null, {
      code: reqCode(req.body, 'code'),
      customer_id: reqIntPos(req.body, 'customer_id'),
      items: req.body.items,
      employee_id: req.body.employee_id || null,
      created_by: req.user.username,
      idempotency_key: key,
      contract_id: req.body.contract_id || null,
    }));
  } catch (e) { return fail(res, e); }
});
router.post('/orders/:id/cancel', requirePerm('orders.write'), async (req, res) => {
  try { return ok(res, await salesService.cancelOrder(null, req.params.id, req.user.username)); }
  catch (e) { return fail(res, e); }
});
router.post('/orders/:id/refund', requirePerm('orders.write'), async (req, res) => {
  try { return ok(res, await salesService.refundOrder(null, req.params.id, req.user.username)); }
  catch (e) { return fail(res, e); }
});

router.get('/sales/kpi', requirePerm('orders.read'), async (req, res) => {
  try {
    const rev = await get("SELECT COALESCE(SUM(amount),0) s, COUNT(*) c FROM orders WHERE order_date >= date('now','-30 days') AND status NOT IN ('cancelled','refunded','draft')");
    const won = await get("SELECT COUNT(*) c FROM leads WHERE stage='won'");
    const total = await get('SELECT COUNT(*) c FROM leads');
    const winRate = total?.c ? Math.round((won?.c || 0) / total.c * 1000) / 10 : 0;
    return ok(res, { revenue30d: Number(rev?.s || 0), orders30d: Number(rev?.c || 0), win_rate: winRate });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
