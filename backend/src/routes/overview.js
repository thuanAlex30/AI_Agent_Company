const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { get, all, run } = require('../common/db');
const ov = require('../modules/governance/overview');
const riskService = require('../modules/risk/service');
const itService = require('../modules/it/service');
const qaService = require('../modules/qa/service');
const productService = require('../modules/product/service');

const router = express.Router();
router.use(authenticate);

router.get('/departments/overview', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await ov.getOverview(null)); }
  catch (e) { return fail(res, e); }
});
router.get('/agent/brief', requirePerm('orders.read'), async (req, res) => {
  try {
    const data = await ov.getOverview(null);
    return ok(res, { markdown: ov.dailyBrief(data), generated_at: data.generated_at });
  } catch (e) { return fail(res, e); }
});

router.get('/risks', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await riskService.list(null)); }
  catch (e) { return fail(res, e); }
});
router.post('/risks', requirePerm('risks.write'), async (req, res) => {
  try {
    return ok(res, await riskService.create(null, { title: req.body.title, level: req.body.level || 'medium', owner: req.body.owner || null, due_date: req.body.due_date || null, actor: req.user.username }));
  } catch (e) { return fail(res, e); }
});

router.get('/it-incidents', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await itService.list(null)); }
  catch (e) { return fail(res, e); }
});
router.post('/it-incidents', requirePerm('it.write'), async (req, res) => {
  try {
    return ok(res, await itService.create(null, { code: req.body.code, title: req.body.title, severity: req.body.severity || 'p3', actor: req.user.username }));
  } catch (e) { return fail(res, e); }
});
router.patch('/it-incidents/:id', requirePerm('it.write'), async (req, res) => {
  try {
    return ok(res, await itService.setStatus(null, req.params.id, { status: req.body.status, mttr_min: req.body.mttr_min ?? null }, req.user.username));
  } catch (e) { return fail(res, e); }
});
router.get('/it/health', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await itService.health(null)); }
  catch (e) { return fail(res, e); }
});

router.get('/product-features', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await productService.list(null)); }
  catch (e) { return fail(res, e); }
});
router.post('/product-features', requirePerm('productfeat.write'), async (req, res) => {
  try {
    return ok(res, await productService.create(null, { title: req.body.title, stage: req.body.stage || 'idea', owner: req.body.owner || null, actor: req.user.username }));
  } catch (e) { return fail(res, e); }
});

module.exports = router;
