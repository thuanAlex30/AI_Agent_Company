const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run, tx } = require('../common/db');
const { reqStr, reqIntPos, reqCode } = require('../common/validate');
const supplyService = require('../modules/supply/service');

const router = express.Router();
router.use(authenticate);

router.get('/products', requirePerm('orders.read'), async (req, res) => {
  try {
    const rows = await all('SELECT p.*, COALESCE((SELECT SUM(qty) FROM stock_moves s WHERE s.product_sku=p.sku),0) AS stock FROM products p ORDER BY p.sku');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/products', requirePerm('products.write'), async (req, res) => {
  try {
    const sku = reqCode(req.body, 'sku');
    const name = reqStr(req.body, 'name', { max: 200 });
    const price = reqIntPos(req.body, 'price');
    const cost = reqIntPos(req.body, 'cost');
    await run('INSERT INTO products(sku,name,price,cost) VALUES(?,?,?,?)', [sku, name, price, cost]);
    return ok(res, { sku });
  } catch (e) { return fail(res, e); }
});

router.post('/stock/in', requirePerm('stock.write'), async (req, res) => {
  try {
    return ok(res, await supplyService.moveStock(null, {
      sku: reqCode(req.body, 'sku'), type: 'in', qty: reqIntPos(req.body, 'qty'),
      ref_code: req.body.ref_code || null, created_by: req.user.username,
      idempotency_key: req.headers['idempotency-key'] || null,
    }));
  } catch (e) { return fail(res, e); }
});
router.post('/stock/out', requirePerm('stock.write'), async (req, res) => {
  try {
    const qty = reqIntPos(req.body, 'qty');
    return ok(res, await supplyService.moveStock(null, {
      sku: reqCode(req.body, 'sku'), type: 'out', qty: -qty,
      ref_code: req.body.ref_code || null, created_by: req.user.username,
      idempotency_key: req.headers['idempotency-key'] || null,
    }));
  } catch (e) { return fail(res, e); }
});

router.get('/ops/alerts', requirePerm('orders.read'), async (req, res) => {
  try {
    const rows = await all('SELECT p.sku, p.name, p.stock_alert, COALESCE((SELECT SUM(qty) FROM stock_moves s WHERE s.product_sku=p.sku),0) AS stock FROM products p');
    return ok(res, rows.filter((r) => Number(r.stock) <= Number(r.stock_alert)));
  } catch (e) { return fail(res, e); }
});

router.get('/suppliers', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM suppliers ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/suppliers', requirePerm('po.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const name = reqStr(req.body, 'name', { max: 200 });
    const r = await run('INSERT INTO suppliers(code,name,phone) VALUES(?,?,?)', [code, name, req.body.phone || null]);
    const id = r.lastInsertRowid || (await get('SELECT id FROM suppliers WHERE code=?', [code]))?.id;
    return ok(res, { id, code });
  } catch (e) { return fail(res, e); }
});

router.get('/purchase-orders', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM purchase_orders ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/purchase-orders', requirePerm('po.write'), async (req, res) => {
  try {
    return ok(res, await supplyService.createPO(null, {
      code: reqCode(req.body, 'code'), supplier_id: req.body.supplier_id || null,
      amount: reqIntPos(req.body, 'amount'), need_date: req.body.need_date || null,
      created_by: req.user.username, idempotency_key: req.headers['idempotency-key'] || null,
    }));
  } catch (e) { return fail(res, e); }
});
router.post('/purchase-orders/:id/receive', requirePerm('po.write'), async (req, res) => {
  try { return ok(res, await supplyService.receivePO(null, req.params.id, { items: req.body.items || [], actor: req.user.username })); }
  catch (e) { return fail(res, e); }
});

router.get('/shipments', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM shipments ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/shipments', requirePerm('shipments.write'), async (req, res) => {
  try {
    return ok(res, await supplyService.createShipment(null, { order_id: reqIntPos(req.body, 'order_id'), carrier: req.body.carrier || null, created_by: req.user.username }));
  } catch (e) { return fail(res, e); }
});
router.patch('/shipments/:id', requirePerm('shipments.write'), async (req, res) => {
  try {
    return ok(res, await supplyService.setShipment(null, req.params.id, {
      status: reqStr(req.body, 'status', { enum: ['shipping', 'done', 'failed', 'cancelled'] }),
      tracking_code: req.body.tracking_code || null, carrier: req.body.carrier || null,
    }, req.user.username));
  } catch (e) { return fail(res, e); }
});

router.get('/qa-checks', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM qa_checks ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/qa-checks', requirePerm('orders.read'), async (req, res) => {
  try {
    const r = await run('INSERT INTO qa_checks(ref_type,ref_id,result,defect,checker) VALUES(?,?,?,?,?)',
      [reqStr(req.body, 'ref_type', { enum: ['order', 'shipment', 'product'] }), req.body.ref_id, reqStr(req.body, 'result', { enum: ['pass', 'fail'] }), req.body.defect || null, req.user.username]);
    return ok(res, { id: r.lastInsertRowid });
  } catch (e) { return fail(res, e); }
});

router.get('/sop-tasks', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM sop_tasks ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/sop-tasks', requirePerm('orders.read'), async (req, res) => {
  try {
    const r = await run('INSERT INTO sop_tasks(dept_code,title,owner,due_date,status) VALUES(?,?,?,?,\'todo\')',
      [req.body.dept_code || null, reqStr(req.body, 'title', { max: 300 }), req.body.owner || null, req.body.due_date || null]);
    return ok(res, { id: r.lastInsertRowid });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
