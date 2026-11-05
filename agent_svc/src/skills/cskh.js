async function run(conn) {
  const ov = require('../overview');
  const d = await ov.getOverview(conn);
  return { open: d.cskh?.open ?? 0, sla_breach: d.cskh?.sla_breach ?? 0, csat_avg: d.cskh?.csat_avg ?? 0, fcr: d.cskh?.fcr ?? 100 };
}
module.exports = { key: 'cskh', run };
