const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');

// marketing: ROI CHI tu v_campaign_roi (JOIN leads), cpo>200k alert.
async function roi(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const rows = await c.query('SELECT * FROM v_campaign_roi ORDER BY campaign_id');
  return rows.map((r) => {
    const leads = Number(r.leads || 0);
    const orders = Number(r.orders || 0);
    const cost = Number(r.cost || 0);
    const cpo = orders > 0 ? Math.round(cost / orders) : null;
    return { ...r, cpo, cpo_alert: cpo != null && cpo > 200000 };
  });
}

async function createCampaign(conn, { name, channel, cost = 0, start_date = null, end_date = null, actor = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!name) throw new AppError('VALIDATION', 'Campaign can name', 400);
  if (!['facebook', 'tiktok', 'zalo', 'shopee', 'offline', 'seo'].includes(channel)) throw new AppError('VALIDATION', 'channel khong hop le', 400);
  const r = await c.run('INSERT INTO campaigns(name,channel,cost,start_date,end_date) VALUES(?,?,?,?,?)', [name, channel, cost, start_date, end_date]);
  const id = r.lastInsertRowid || (await c.get('SELECT id FROM campaigns ORDER BY id DESC LIMIT 1'))?.id;
  await writeAudit(c, actor || 'system', 'create', 'campaigns', id, null, { name, channel });
  return { id };
}

module.exports = { roi, createCampaign };
