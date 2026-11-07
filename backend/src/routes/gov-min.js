const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run } = require('../common/db');
const gov = require('../modules/governance/approvals');

const router = express.Router();
router.use(authenticate);

router.get('/approvals', requirePerm('approvals.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM approvals ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/approvals', requirePerm('approvals.request'), async (req, res) => {
  try {
    return ok(res, await gov.requestApproval(null, {
      ref_type: req.body.ref_type, ref_id: req.body.ref_id,
      requester: req.user.id, level: req.body.level || null, note: req.body.note || null,
    }));
  } catch (e) { return fail(res, e); }
});
router.post('/approvals/:id/decide', requirePerm('approvals.decide'), async (req, res) => {
  try {
    return ok(res, await gov.decideApproval(null, req.params.id, {
      decider: req.user.id, decision: req.body.decision, note: req.body.note || null,
    }));
  } catch (e) { return fail(res, e); }
});

router.get('/audit', requirePerm('audit.read'), async (req, res) => {
  try {
    const { table, record } = req.query;
    let sql = 'SELECT * FROM audit_log ORDER BY id DESC LIMIT 200';
    let params = [];
    if (table && record) { sql = 'SELECT * FROM audit_log WHERE table_name=? AND record_id=? ORDER BY id DESC LIMIT 200'; params = [table, record]; }
    return ok(res, await all(sql, params));
  } catch (e) { return fail(res, e); }
});

router.post('/users/:id/unlock', requirePerm('users.unlock'), async (req, res) => {
  try {
    const u = await get('SELECT * FROM users WHERE id=?', [req.params.id]);
    if (!u) throw new AppError('NOT_FOUND', 'Khong tim thay user', 404);
    const { tx } = require('../common/db');
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
