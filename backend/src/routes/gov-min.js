const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run, tx } = require('../common/db');
const {
  requireScoped, scopedList, assertBusinessScope, enforceDept, setBusinessScope,
} = require('../common/scope');
const gov = require('../modules/governance/approvals');

const router = express.Router();
router.use(authenticate);

// Phase 3 (P0-5): GET /approvals — chi thay approval lien quan phong ban minh.
router.get('/approvals', requireScoped('approvals.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'approvals',
      'SELECT a.* FROM approvals a ORDER BY a.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/approvals', requirePerm('approvals.request'), async (req, res) => {
  try {
    const refType = req.body.ref_type;
    const refId = req.body.ref_id;
    // Phase 3 (P0-4): khong tao approval cho tai lieu ngoai scope.
    const REF_TABLE = {
      contract: 'contracts', purchase_order: 'purchase_orders',
      expense: 'expenses', discount: 'quotes', leave: 'employees',
    };
    const tbl = REF_TABLE[refType];
    if (tbl) await assertBusinessScope(null, req.user, tbl, refId);
    const out = await gov.requestApproval(null, {
      ref_type: refType, ref_id: refId,
      requester: req.user.id, level: req.body.level || null, note: req.body.note || null,
    });
    // Phase 3: gan phong ban cho approval (theo chung tu).
    const { tx: dbtx } = require('../common/db');
    await dbtx(async (c) => {
      await setBusinessScope(c, 'approvals', out.id, req.user.dept_code || 'ceo');
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/approvals/:id/decide', requirePerm('approvals.decide'), async (req, res) => {
  try {
    // Phase 3 (P0-4): chi quyet approval trong pham vi scope.
    await assertBusinessScope(null, req.user, 'approvals', req.params.id);
    return ok(res, await gov.decideApproval(null, req.params.id, {
      decider: req.user.id, decision: req.body.decision, note: req.body.note || null,
    }));
  } catch (e) { return fail(res, e); }
});

// Phase 3: GET /audit — chi tra audit cua ban ghi TRONG phong ban minh.
router.get('/audit', requirePerm('audit.read'), async (req, res) => {
  try {
    const { table, record } = req.query;
    const { resolveScope } = require('../common/scope');
    const s = resolveScope(req.user);
    if (s.allDepts) {
      let sql = 'SELECT * FROM audit_log ORDER BY id DESC LIMIT 200';
      let params = [];
      if (table && record) { sql = 'SELECT * FROM audit_log WHERE table_name=? AND record_id=? ORDER BY id DESC LIMIT 200'; params = [table, record]; }
      return ok(res, await all(sql, params));
    }
    if (s.denied || !s.depts.length) return ok(res, []);
    // Loc theo resource_dept: audit cua ban ghi thuoc phong ban trong scope.
    const ph = s.depts.map(() => '?').join(',');
    let sql = `SELECT a.* FROM audit_log a
               WHERE EXISTS (SELECT 1 FROM resource_dept d
                             WHERE d.table_name=a.table_name AND d.record_id=a.record_id
                               AND d.dept_code IN (${ph}))
               ORDER BY a.id DESC LIMIT 200`;
    let params = [...s.depts];
    if (table && record) {
      sql = `SELECT a.* FROM audit_log a
             WHERE a.table_name=? AND a.record_id=?
               AND EXISTS (SELECT 1 FROM resource_dept d
                           WHERE d.table_name=a.table_name AND d.record_id=a.record_id
                             AND d.dept_code IN (${ph}))
             ORDER BY a.id DESC LIMIT 200`;
      params = [table, record, ...s.depts];
    }
    return ok(res, await all(sql, params));
  } catch (e) { return fail(res, e); }
});

router.post('/users/:id/unlock', requirePerm('users.unlock'), async (req, res) => {
  try {
    const u = await get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!u) throw new AppError('NOT_FOUND', 'Khong tim thay user', 404);
    const { writeAudit } = require('../common/audit');
    // GOV-01: ghi du lieu + audit trong CUNG transaction.
    await tx(async (c) => {
      await c.run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?', [req.params.id]);
      await writeAudit(c, req.user.username, 'update', 'users', req.params.id, { locked: true }, { locked: false });
    });
    return ok(res, { id: Number(req.params.id), unlocked: true });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
