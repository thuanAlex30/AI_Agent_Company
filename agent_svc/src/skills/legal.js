async function run(conn) {
  const ov = require('../overview');
  const d = await ov.getOverview(conn);
  return d.legal;
}
module.exports = { key: 'legal', run };
