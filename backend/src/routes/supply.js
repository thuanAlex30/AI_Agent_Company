const express = require('express');
const { authenticate, requirePerm, actorId } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run, tx, insertedId } = require('../common/db');
const { reqStr, reqIntPos, reqCode } = require('../common/validate');
const {
  requireScoped, scopedList, assertBusinessScope, enforceDept,
  setBusinessScope, scopeFilter, resolveResourceDept,
} = require('../common/scope');
const supplyService = require('../modules/supply/service');

const router = express.Router();
router.use(authenticate);

// GET /products — catalog noi bo: doc TOAN BO la OK (chinh sach).
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
    // P1-14: tx + audit (INV-2: audit phai cung tx voi du lieu nghiep vu).
    const out = await tx(async (c) => {
      // BUG (PG-DB-01): `products` khoa chinh la `sku` (TEXT), KHONG co cot `id`.
      // `insertedId()` se nem loi fail-fast tren PG (adapter tra null vi
      // `RETURNING id` khong ap dung) => route 500 khong tao duoc san pham.
      // Dinh danh cua ban ghi la `sku` => dung `sku` lam record_id cho audit.
      const r = await c.run('INSERT INTO products(sku,name,price,cost) VALUES(?,?,?,?)', [sku, name, price, cost]);
      if (!r.changes) throw new AppError('VALIDATION', 'Khong tao duoc san pham', 400);
      const { writeAudit } = require('../common/audit');
      await writeAudit(c, req.user.username, 'create', 'products', sku, null, { sku, name, price, cost });
      return { id: sku, sku };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

router.post('/stock/in', requirePerm('stock.write'), async (req, res) => {
  try {
    // P1-14: mutation trong tx (audit cung tx — INV-2).
    const out = await tx((conn) => supplyService.moveStock(conn, {
      sku: reqCode(req.body, 'sku'), type: 'in', qty: reqIntPos(req.body, 'qty'),
      ref_code: req.body.ref_code || null,
      // Phase 1 (P0-1): created_by = ID (so) cho cot BIGINT; actor = username cho audit.
      created_by: actorId(req.user), actor: req.user.username,
      idempotency_key: req.headers['idempotency-key'] || null,
    }));
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/stock/out', requirePerm('stock.write'), async (req, res) => {
  try {
    const qty = reqIntPos(req.body, 'qty');
    // P1-14: mutation trong tx (audit cung tx — INV-2).
    const out = await tx((conn) => supplyService.moveStock(conn, {
      sku: reqCode(req.body, 'sku'), type: 'out', qty: -qty,
      ref_code: req.body.ref_code || null,
      created_by: actorId(req.user), actor: req.user.username,
      idempotency_key: req.headers['idempotency-key'] || null,
    }));
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

// Phase 3: ops/alerts — ton kho thuoc phong ban supply/ops => loc theo scope.
// `products` khong co `id` => khong JOIN resource_dept truc tiep; tach phan ton
// kho (stock_moves, co resource_dept) roi ghep voi danh muc products.
router.get('/ops/alerts', requireScoped('orders.read'), async (req, res) => {
  try {
    const moves = await scopedList(null, req.user, 'stock_moves',
      'SELECT s.product_sku AS sku, s.qty AS qty FROM stock_moves s');
    const stock = {};
    for (const m of moves) {
      const k = m.sku;
      stock[k] = Number(stock[k] || 0) + Number(m.qty || 0);
    }
    const products = await all('SELECT sku, name, stock_alert FROM products ORDER BY sku');
    const rows = products
      .map((p) => ({ sku: p.sku, name: p.name, stock_alert: p.stock_alert, stock: Number(stock[p.sku] || 0) }))
      .filter((r) => r.stock <= Number(r.stock_alert));
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});

router.get('/suppliers', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'suppliers',
      'SELECT s.* FROM suppliers s ORDER BY s.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/suppliers', requirePerm('po.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const name = reqStr(req.body, 'name', { max: 200 });
    const { writeAudit } = require('../common/audit');
    // Phase 3: ghi resource_dept (supplier thuoc phong ban supply) + audit trong
    // CUNG transaction (GOV-01).
    const out = await tx(async (c) => {
      const r = await c.run('INSERT INTO suppliers(code,name,phone) VALUES(?,?,?)', [code, name, req.body.phone || null]);
      const id = insertedId(r, 'suppliers');
      await setBusinessScope(c, 'suppliers', id, 'supply');
      await writeAudit(c, req.user.username, 'create', 'suppliers', id, null, { code, name });
      return { id, code };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

router.get('/purchase-orders', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'purchase_orders',
      'SELECT p.* FROM purchase_orders p ORDER BY p.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/purchase-orders', requirePerm('po.write'), async (req, res) => {
  try {
    return ok(res, await supplyService.createPO(null, {
      code: reqCode(req.body, 'code'), supplier_id: req.body.supplier_id || null,
      amount: reqIntPos(req.body, 'amount'), need_date: req.body.need_date || null,
      created_by: actorId(req.user), actor: req.user.username,
      idempotency_key: req.headers['idempotency-key'] || null,
    }));
  } catch (e) { return fail(res, e); }
});
router.post('/purchase-orders/:id/receive', requirePerm('po.write'), async (req, res) => {
  try {
    // Phase 3 (P0-4): khong nhan PO cua phong ban khac.
    await assertBusinessScope(null, req.user, 'purchase_orders', req.params.id);
    return ok(res, await supplyService.receivePO(null, req.params.id, { items: req.body.items || [], actor: req.user.username, actor_id: actorId(req.user) }));
  } catch (e) { return fail(res, e); }
});

router.get('/shipments', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'shipments',
      'SELECT s.* FROM shipments s ORDER BY s.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/shipments', requireScoped('shipments.write'), async (req, res) => {
  try {
    // Phase 3 (P0-4): van don thuoc don => don phai trong scope.
    await assertBusinessScope(null, req.user, 'orders', reqIntPos(req.body, 'order_id'));
    return ok(res, await supplyService.createShipment(null, { order_id: reqIntPos(req.body, 'order_id'), carrier: req.body.carrier || null, created_by: actorId(req.user), actor: req.user.username }));
  } catch (e) { return fail(res, e); }
});
router.patch('/shipments/:id', requireScoped('shipments.write'), async (req, res) => {
  try {
    // Phase 3 (P0-4): IDOR — doi URL id van don cua phong ban khac.
    await assertBusinessScope(null, req.user, 'shipments', req.params.id);
    return ok(res, await supplyService.setShipment(null, req.params.id, {
      status: reqStr(req.body, 'status', { enum: ['shipping', 'done', 'failed', 'cancelled'] }),
      tracking_code: req.body.tracking_code || null, carrier: req.body.carrier || null,
    }, req.user.username));
  } catch (e) { return fail(res, e); }
});

router.get('/qa-checks', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'qa_checks',
      'SELECT q.* FROM qa_checks q ORDER BY q.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/qa-checks', requireScoped('qa.write'), async (req, res) => {
  try {
    const refType = reqStr(req.body, 'ref_type', { enum: ['order', 'shipment', 'product'] });
    const refId = req.body.ref_id;
    // P2-21 / DATA-08: phai validate `ref_id` TON TAI theo `ref_type` (route
    // truoc day INSERT thang, bo qua validate cua service `qaService.create`):
    //   - `ref_type='product'` -> `ref_id` la SKU (TEXT), kiem tra bang `sku`
    //   - `ref_type='order'|'shipment'` -> `ref_id` la ID (so)
    // => dung service (co validate + audit trong cung tx).
    const qaService = require('../modules/qa/service');
    // Phase 3: QA thuoc phong ban qa; ghi resource_dept + audit trong cung tx.
    const out = await tx(async (c) => {
      const r = await qaService.create(c, {
        ref_type: refType, ref_id: refId,
        result: reqStr(req.body, 'result', { enum: ['pass', 'fail'] }),
        defect: req.body.defect || null,
        checker: req.user.username,
      });
      await setBusinessScope(c, 'qa_checks', r.id, 'qa');
      return r;
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

router.get('/sop-tasks', requireScoped('orders.read'), async (req, res) => {
  try {
    // sop_tasks co cot dept_code that -> scopeFilter (fail-closed).
    const rows = scopeFilter(req.user, await all('SELECT * FROM sop_tasks ORDER BY id DESC LIMIT 200'), 'dept_code');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/sop-tasks', requireScoped('sop.write'), async (req, res) => {
  try {
    const dept = reqStr(req.body, 'dept_code');
    // Phase 3: chi tao SOP trong phong ban trong scope.
    enforceDept(req.user, dept, 'SOP');
    const { writeAudit } = require('../common/audit');
    // GOV-01: ghi du lieu + audit trong CUNG transaction.
    const out = await tx(async (c) => {
      const r = await c.run('INSERT INTO sop_tasks(dept_code,title,owner,due_date,status) VALUES(?,?,?,?,\'todo\')',
        [dept, reqStr(req.body, 'title', { max: 300 }), req.body.owner || null, req.body.due_date || null]);
      const id = insertedId(r, 'sop_tasks');
      await writeAudit(c, req.user.username, 'create', 'sop_tasks', id, null, { dept, title: req.body.title });
      return { id };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

module.exports = router;
