const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { all, tx, insertedId } = require('../common/db');
const { requireScoped, scopedList, setBusinessScope } = require('../common/scope');
const mkt = require('../modules/marketing/service');

const router = express.Router();
router.use(authenticate);

// Phase 3: campaigns thuoc phong ban marketing => loc theo scope.
router.get('/campaigns', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'campaigns',
      'SELECT c.* FROM campaigns c ORDER BY c.id DESC LIMIT 100');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/campaigns', requirePerm('campaigns.write'), async (req, res) => {
  try {
    // Phase 3 + GOV-01: ghi resource_dept (marketing) + audit trong CUNG tx.
    const { writeAudit } = require('../common/audit');
    const out = await tx(async (c) => {
      const r = await c.run('INSERT INTO campaigns(name,channel,cost,start_date,end_date) VALUES(?,?,?,?,?)',
        [req.body.name, req.body.channel, req.body.cost || 0, req.body.start_date || null, req.body.end_date || null]);
      const id = insertedId(r, 'campaigns');
      await setBusinessScope(c, 'campaigns', id, 'marketing');
      await writeAudit(c, req.user.username, 'create', 'campaigns', id, null, { name: req.body.name, channel: req.body.channel });
      return { id };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.get('/marketing/roi', requireScoped('orders.read'), async (req, res) => {
  try {
    // ROI chi tinh tren campaign TRONG scope (fail-closed).
    const ids = (await scopedList(null, req.user, 'campaigns', 'SELECT c.id FROM campaigns c')).map((r) => r.id);
    const allRows = await mkt.roi(null);
    const set = new Set(ids.map(Number));
    const rows = allRows.filter((r) => set.has(Number(r.campaign_id)));
    const leads = rows.reduce((s, r) => s + Number(r.leads || 0), 0);
    const orders = rows.reduce((s, r) => s + Number(r.orders || 0), 0);
    const cost = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
    const cpo = orders > 0 ? Math.round(cost / orders) : null;
    return ok(res, {
      campaigns: rows.length, leads, orders, cost, cpo,
      cpo_alert: cpo != null && cpo > 200000,
      rows,
    });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
