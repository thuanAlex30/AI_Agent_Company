const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { all } = require('../common/db');
const mkt = require('../modules/marketing/service');

const router = express.Router();
router.use(authenticate);

router.get('/campaigns', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM campaigns ORDER BY id DESC LIMIT 100')); }
  catch (e) { return fail(res, e); }
});
router.post('/campaigns', requirePerm('campaigns.write'), async (req, res) => {
  try {
    return ok(res, await mkt.createCampaign(null, {
      name: req.body.name, channel: req.body.channel, cost: req.body.cost || 0,
      start_date: req.body.start_date || null, end_date: req.body.end_date || null, actor: req.user.username,
    }));
  } catch (e) { return fail(res, e); }
});
router.get('/marketing/roi', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await mkt.roi(null)); }
  catch (e) { return fail(res, e); }
});

module.exports = router;
