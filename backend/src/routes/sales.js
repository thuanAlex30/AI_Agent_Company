const express = require('express');
const { authenticate, requirePerm, actorId } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run, tx, insertedId } = require('../common/db');
const { reqStr, reqIntPos, reqCode } = require('../common/validate');
const {
  scopeFilter, assertResourceScope, assertBusinessScope, enforceDept,
  requireScoped, scopedList, setBusinessScope, resolveResourceDept,
} = require('../common/scope');
const { writeAudit } = require('../common/audit');
const salesService = require('../modules/sales/service');

const router = express.Router();
router.use(authenticate);

// Phase 3 (P0-5): moi list doc qua scopedList (JOIN resource_dept) — KHONG
// doc toan bo du lieu cong ty rồi loc o JS.
//
// customers
router.get('/customers', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'customers',
      'SELECT c.* FROM customers c ORDER BY c.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/customers', requireScoped('customers.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const name = reqStr(req.body, 'name', { max: 200 });
    const phone = reqStr(req.body, 'phone', { optional: true, max: 20 });
    const type = reqStr(req.body, 'type', { optional: true, enum: ['retail', 'wholesale', 'enterprise'] }) || 'retail';
    // GOV-01: ghi du lieu + audit trong CUNG transaction.
    // Phase 3: ghi resource_dept trong CUNG transaction (fail-closed scope).
    const out = await tx(async (c) => {
      const r = await c.run('INSERT INTO customers(code,name,phone,type,owner_employee_id) VALUES(?,?,?,?,?)',
        [code, name, phone || null, type, req.body.owner_employee_id || null]);
      const id = insertedId(r, 'customers');
      const dept = await resolveResourceDept(c, 'customers', { ownerEmployeeId: req.body.owner_employee_id || null });
      await setBusinessScope(c, 'customers', id, dept, req.body.owner_employee_id || null);
      await writeAudit(c, req.user.username, 'create', 'customers', id, null, { code, name, dept });
      return { id, code };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.get('/customers/:id', requireScoped('orders.read'), async (req, res) => {
  try {
    // Phase 3 (P0-4): assertBusinessScope chong IDOR (doi URL id).
    await assertBusinessScope(null, req.user, 'customers', req.params.id);
    const row = await get('SELECT * FROM customers WHERE id=?', [req.params.id]);
    if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay KH', 404);
    return ok(res, row);
  } catch (e) { return fail(res, e); }
});

// leads
router.get('/leads', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'leads',
      'SELECT l.* FROM leads l ORDER BY l.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/leads', requireScoped('leads.write'), async (req, res) => {
  try {
    const name = reqStr(req.body, 'name', { max: 200 });
    const phone = reqStr(req.body, 'phone', { max: 20 });
    const out = await tx(async (c) => {
      // Phase 3: lead thuoc ve nhan vien tao (owner) — khong cho client
      // chi dinh owner_employee_id bat ky (chong IDOR ghi vao phong ban khac).
      const ownerId = req.body.owner_employee_id || null;
      const r = await c.run('INSERT INTO leads(name,phone,source,stage,owner_employee_id) VALUES(?,?,?,?,?)',
        [name, phone, req.body.source || null, 'new', ownerId]);
      const id = insertedId(r, 'leads');
      const dept = await resolveResourceDept(c, 'leads', { ownerEmployeeId: ownerId });
      await setBusinessScope(c, 'leads', id, dept, ownerId);
      await writeAudit(c, req.user.username, 'create', 'leads', id, null, { name, phone, dept });
      return { id };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/leads/:id/convert', requireScoped('leads.write'), async (req, res) => {
  try {
    await assertBusinessScope(null, req.user, 'leads', req.params.id);
    return ok(res, await salesService.convertLead(null, req.params.id, req.user.username));
  } catch (e) { return fail(res, e); }
});

// quotes
router.get('/quotes', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'quotes',
      'SELECT q.* FROM quotes q ORDER BY q.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/quotes', requireScoped('quotes.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const amount = reqIntPos(req.body, 'amount');
    const out = await tx(async (c) => {
      const r = await c.run('INSERT INTO quotes(code,lead_id,customer_id,amount,status,created_by) VALUES(?,?,?,?,?,?)',
        [code, req.body.lead_id || null, req.body.customer_id || null, amount, 'draft', actorId(req.user)]);
      const id = insertedId(r, 'quotes');
      const dept = await resolveResourceDept(c, 'quotes', { customerId: req.body.customer_id || null });
      await setBusinessScope(c, 'quotes', id, dept);
      await writeAudit(c, req.user.username, 'create', 'quotes', id, null, { code, amount, dept });
      return { id, code };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

// contracts
router.get('/contracts', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'contracts',
      'SELECT ct.* FROM contracts ct ORDER BY ct.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/contracts', requireScoped('quotes.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const amount = reqIntPos(req.body, 'amount');
    const customer_id = reqIntPos(req.body, 'customer_id');
    const out = await tx(async (c) => {
      const r = await c.run('INSERT INTO contracts(code,customer_id,quote_id,amount,status,created_by) VALUES(?,?,?,?,?,?)',
        [code, customer_id, req.body.quote_id || null, amount, 'draft', actorId(req.user)]);
      const id = insertedId(r, 'contracts');
      const dept = await resolveResourceDept(c, 'contracts', { customerId: customer_id });
      await setBusinessScope(c, 'contracts', id, dept);
      await writeAudit(c, req.user.username, 'create', 'contracts', id, null, { code, amount, dept });
      return { id, code };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/contracts/:id/submit-approval', requireScoped('quotes.write'), async (req, res) => {
  try {
    // Phase 3 (P0-4): kiem tra scope truoc khi submit (khong submit hop dong
    // cua phong ban khac).
    await assertBusinessScope(null, req.user, 'contracts', req.params.id);
    const ct = await get('SELECT * FROM contracts WHERE id=?', [req.params.id]);
    if (!ct) throw new AppError('NOT_FOUND', 'Khong tim thay hop dong', 404);
    // P1-6: cap duyet LUON tinh tu approval-matrix.json (goi gov.requestApproval)
    // — KHONG hardcode 50tr, KHONG tin `level` tu client.
    const gov = require('../modules/governance/approvals');
    const out = await tx(async (c) => {
      await c.run('UPDATE contracts SET status=? WHERE id=?', ['pending_approval', ct.id]);
      const ap = await gov.requestApproval(c, {
        ref_type: 'contract', ref_id: ct.id,
        requester: req.user.id, requester_username: req.user.username,
        note: req.body.note || null,
      });
      // P1-6: cap duyet BO SUNG (legal) theo approval-matrix.json
      // (`amount_routing.contract_extra_legal`) — 1 approval rieng biet.
      for (const lv of gov.extraLevelsFor('contract', Number(ct.amount), req.body.note || '')) {
        if (lv === ap.level) continue;
        const extra = await gov.requestApproval(c, {
          ref_type: 'contract', ref_id: ct.id,
          requester: req.user.id, requester_username: req.user.username,
          level: lv, note: req.body.note || null,
        });
        await setBusinessScope(c, 'approvals', extra.id, req.user.dept_code || 'sales');
      }
      await setBusinessScope(c, 'approvals', ap.id, req.user.dept_code || 'sales');
      await writeAudit(c, req.user.username, 'update', 'contracts', ct.id, { status: ct.status }, { status: 'pending_approval', level: ap.level });
      return ap;
    });
    return ok(res, { id: ct.id, status: 'pending_approval', level: out.level });
  } catch (e) { return fail(res, e); }
});

// orders
router.get('/orders', requireScoped('orders.read'), async (req, res) => {
  try {
    // Phase 3 (P0-5): route quan trong nhat — chi don trong pham vi scope.
    const rows = await scopedList(null, req.user, 'orders',
      'SELECT o.* FROM orders o ORDER BY o.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/orders', requireScoped('orders.write'), async (req, res) => {
  try {
    const key = req.headers['idempotency-key'] || req.body.idempotency_key || null;
    // Phase 3: KHONG nhan employee_id bat ky tu client — chi dung cua chinh
    // user (hoac null => tu dong = user) => chong ghi don vao phong ban khac.
    let employeeId = req.body.employee_id || null;
    if (employeeId) {
      const me = await get('SELECT id FROM employees WHERE code=?', [req.user.employee_code || '']);
      if (!me || Number(me.id) !== Number(employeeId)) {
        throw new AppError('FORBIDDEN', 'Chi duoc gan don cho chinh minh', 403);
      }
    }
    return ok(res, await salesService.createOrder(null, {
      code: reqCode(req.body, 'code'),
      customer_id: reqIntPos(req.body, 'customer_id'),
      items: req.body.items,
      employee_id: employeeId,
      created_by: actorId(req.user), actor: req.user.username,
      idempotency_key: key,
      contract_id: req.body.contract_id || null,
    }));
  } catch (e) { return fail(res, e); }
});
router.post('/orders/:id/cancel', requireScoped('orders.write'), async (req, res) => {
  try {
    await assertBusinessScope(null, req.user, 'orders', req.params.id);
    return ok(res, await salesService.cancelOrder(null, req.params.id, req.user.username, actorId(req.user)));
  } catch (e) { return fail(res, e); }
});
router.post('/orders/:id/refund', requireScoped('orders.write'), async (req, res) => {
  try {
    await assertBusinessScope(null, req.user, 'orders', req.params.id);
    return ok(res, await salesService.refundOrder(null, req.params.id, req.user.username, actorId(req.user)));
  } catch (e) { return fail(res, e); }
});

router.get('/sales/kpi', requireScoped('orders.read'), async (req, res) => {
  try {
    const { sinceVN } = require('../common/db');
    const { resolveScope } = require('../common/scope');
    const s = resolveScope(req.user);
    // Phase 3: KPI tinh TRONG scope (khong lo du lieu toan cong ty).
    const rows = await scopedList(null, req.user, 'orders',
      `SELECT o.amount, o.status, o.order_date FROM orders o WHERE o.order_date >= ? AND o.status NOT IN ('cancelled','refunded','draft')`,
      [sinceVN(30)]);
    const rev = rows.reduce((a, r) => a + Number(r.amount || 0), 0);
    const won = await scopedList(null, req.user, 'leads', "SELECT l.id FROM leads l WHERE l.stage='won'");
    const total = await scopedList(null, req.user, 'leads', 'SELECT l.id FROM leads l');
    const winRate = total.length ? Math.round((won.length / total.length) * 1000) / 10 : 0;
    // Header de audit: FE/ops biet pham vi du lieu duoc tinh.
    res.setHeader('X-Scope-Depts', s.allDepts ? 'ALL' : s.depts.join(','));
    return ok(res, { revenue30d: rev, orders30d: rows.length, win_rate: winRate });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
