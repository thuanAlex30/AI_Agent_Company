async function run(conn) {
  const ov = require('../overview');
  const d = await ov.getOverview(conn);
  return d.ops;
}
module.exports = { key: 'ops', run };
