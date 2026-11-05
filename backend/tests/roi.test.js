const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const { get, run } = require('../src/common/db');
const mkt = require('../src/modules/marketing/service');

test('roi1: ROI chi tu v_campaign_roi, tang khi them lead', async () => {
  const before = await mkt.roi(null);
  const camp = before[0];
  assert.ok(camp, 'phai co campaign seed');
  const leads0 = Number(camp.leads);
  await run('INSERT INTO leads(name,phone,source,campaign_id,stage) VALUES(?,?,?, ?,?)', ['ROI Test', '099' + String(Date.now()).slice(-7), 'test', camp.campaign_id, 'won']);
  const after = await mkt.roi(null);
  const camp2 = after.find((r) => Number(r.campaign_id) === Number(camp.campaign_id));
  assert.equal(Number(camp2.leads), leads0 + 1);
  assert.equal(Number(camp2.orders), Number(camp.orders) + 1);
  await run("DELETE FROM leads WHERE source='test'");
});

test('roi2: cpo>200k alert', async () => {
  const rows = await mkt.roi(null);
  for (const r of rows) {
    if (r.cpo != null && r.cpo > 200000) assert.equal(r.cpo_alert, true);
  }
  assert.ok(true);
});
