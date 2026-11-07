const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { get, all, run, tx } = require('../common/db');
const { requireScoped, scopedList, setBusinessScope } = require('../common/scope');
const ov = require('../modules/governance/overview');
const riskService = require('../modules/risk/service');
const itService = require('../modules/it/service');
const qaService = require('../modules/qa/service');
const productService = require('../modules/product/service');

const router = express.Router();
router.use(authenticate);

// Phase 3 (P0-5): overview phan quyen theo vai + header X-Scope-Depts de audit.
router.get('/departments/overview', requireScoped('orders.read'), async (req, res) => {
  try {
    const { resolveScope } = require('../common/scope');
    const s = resolveScope(req.user);
    const data = await ov.getOverview(null, req.user);
    res.setHeader('X-Scope-Depts', s.allDepts ? 'ALL' : s.depts.join(','));
    return ok(res, data);
  } catch (e) { return fail(res, e); }
});
router.get('/agent/brief', requireScoped('orders.read'), async (req, res) => {
  try {
    const { resolveScope } = require('../common/scope');
    const s = resolveScope(req.user);
    const data = await ov.getOverview(null, req.user);
    res.setHeader('X-Scope-Depts', s.allDepts ? 'ALL' : s.depts.join(','));
    return ok(res, { markdown: ov.dailyBrief(data), generated_at: data.generated_at });
  } catch (e) { return fail(res, e); }
});

router.get('/risks', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'risks',
      'SELECT r.* FROM risks r ORDER BY r.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/risks', requirePerm('risks.write'), async (req, res) => {
  try {
    const { writeAudit } = require('../common/audit');
    const out = await tx(async (c) => {
      const r = await riskService.create(c, { title: req.body.title, level: req.body.level || 'medium', owner: req.body.owner || null, due_date: req.body.due_date || null, actor: req.user.username });
      await setBusinessScope(c, 'risks', r.id, 'legal');
      await writeAudit(c, req.user.username, 'create', 'risks', r.id, null, { title: req.body.title });
      return r;
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

router.get('/it-incidents', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'it_incidents',
      'SELECT i.* FROM it_incidents i ORDER BY i.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/it-incidents', requirePerm('it.write'), async (req, res) => {
  try {
    const { writeAudit } = require('../common/audit');
    const out = await tx(async (c) => {
      const r = await itService.create(c, { code: req.body.code, title: req.body.title, severity: req.body.severity || 'p3', actor: req.user.username });
      await setBusinessScope(c, 'it_incidents', r.id, 'it');
      await writeAudit(c, req.user.username, 'create', 'it_incidents', r.id, null, { code: req.body.code });
      return r;
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.patch('/it-incidents/:id', requirePerm('it.write'), async (req, res) => {
  try {
    const { assertBusinessScope } = require('../common/scope');
    await assertBusinessScope(null, req.user, 'it_incidents', req.params.id);
    return ok(res, await itService.setStatus(null, req.params.id, { status: req.body.status, mttr_min: req.body.mttr_min ?? null }, req.user.username));
  } catch (e) { return fail(res, e); }
});
router.get('/it/health', requireScoped('orders.read'), async (req, res) => {
  try {
    return ok(res, await itService.health(null));
  } catch (e) { return fail(res, e); }
});

router.get('/product-features', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'product_features',
      'SELECT p.* FROM product_features p ORDER BY p.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/product-features', requirePerm('productfeat.write'), async (req, res) => {
  try {
    const { writeAudit } = require('../common/audit');
    const out = await tx(async (c) => {
      const r = await productService.create(c, { title: req.body.title, stage: req.body.stage || 'idea', owner: req.body.owner || null, actor: req.user.username });
      await setBusinessScope(c, 'product_features', r.id, 'product');
      await writeAudit(c, req.user.username, 'create', 'product_features', r.id, null, { title: req.body.title });
      return r;
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

module.exports = router;
