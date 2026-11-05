async function run(conn) {
  const ov = require('../overview');
  const d = await ov.getOverview(conn);
  return { revenue30d: d.sales?.revenue30d ?? 0, win_rate: d.sales?.win_rate ?? 0, orders30d: d.sales?.orders30d ?? 0, retention: d.sales?.retention ?? 0 };
}
module.exports = { key: 'sales', run };
