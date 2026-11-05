async function run(conn) {
  const ov = require('../overview');
  const d = await ov.getOverview(conn);
  return d.marketing;
}
module.exports = { key: 'marketing', run };
