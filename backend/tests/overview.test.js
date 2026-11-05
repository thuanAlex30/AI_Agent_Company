const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const ov = require('../src/modules/governance/overview');

const KEYS12 = ['ceo', 'sales', 'marketing', 'cskh', 'ops', 'supply', 'finance', 'hr', 'it', 'legal', 'qa', 'product'];

test('ov1: du 12 keys + 5 suggestions RACI', async () => {
  const data = await ov.getOverview(null);
  for (const k of KEYS12) assert.ok(data[k] !== undefined, 'thieu khoi ' + k);
  assert.equal(data.agent_suggestion.length, 5);
  for (const s of data.agent_suggestion) {
    assert.ok(s.title && s.why && s.api && s.deadline);
    assert.ok(s.raci && s.raci.R && s.raci.A, 'suggestion thieu RACI');
  }
});

test('ov2: drop 1 bang skill loi khong sap overview', async () => {
  const { run } = require('../src/common/db');
  await run('ALTER TABLE product_features RENAME TO product_features_bak');
  try {
    const data = await ov.getOverview(null);
    assert.ok(data.product && data.product.status === 'error', 'khoi loi phai tra error, khong throw');
    assert.ok(data.sales && data.sales.revenue30d !== undefined, 'khoi khac van song');
  } finally {
    await run('ALTER TABLE product_features_bak RENAME TO product_features');
  }
});

test('ov3: brief doc 2 phut (<400 tu, co 5 viec)', async () => {
  const data = await ov.getOverview(null);
  const md = ov.dailyBrief(data);
  const words = md.split(/\s+/).length;
  assert.ok(words < 400, 'brief phai gon, thay ' + words + ' tu');
  assert.ok(md.includes('5 viec') || md.includes('## 5 viec'));
});
