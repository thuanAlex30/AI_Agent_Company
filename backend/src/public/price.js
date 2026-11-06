// public/price.js — gia theo kenh + khung gio (quyet dinh P0: gia doi theo gio/kenh)
// Quy tac: loc theo channel (all hoac channel hien tai) + khung gio HH:MM, lay priority cao nhat.
// Khong tin gia client — moi checkout phai goi resolvePrice o server.
const { all } = require('../common/db');

function toMinutes(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function nowMinutesVN() {
  const v = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  return v.getHours() * 60 + v.getMinutes();
}

async function priceRows(sku) {
  return all('SELECT * FROM product_prices WHERE sku=? ORDER BY priority DESC, id DESC', [sku]);
}

function pickPrice(basePrice, rows, channel = 'web', nowMin = null) {
  const nm = nowMin == null ? nowMinutesVN() : nowMin;
  for (const r of rows || []) {
    if (r.channel !== 'all' && r.channel !== channel) continue;
    const s = r.start_time ? toMinutes(r.start_time) : null;
    const e = r.end_time ? toMinutes(r.end_time) : null;
    if (s != null && e != null) {
      // khung gio qua dem (vd 22:00-02:00)
      const inside = s <= e ? (nm >= s && nm <= e) : (nm >= s || nm <= e);
      if (!inside) continue;
    } else if ((s != null && nm < s) || (e != null && nm > e)) continue;
    return { price: Number(r.price), rule_id: r.id, channel: r.channel };
  }
  return { price: Number(basePrice), rule_id: null, channel: 'base' };
}

async function resolvePrice(sku, basePrice, channel = 'web') {
  const rows = await priceRows(sku);
  return pickPrice(basePrice, rows, channel);
}

module.exports = { resolvePrice, pickPrice, toMinutes, nowMinutesVN };
