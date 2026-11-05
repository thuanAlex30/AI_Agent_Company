async function run(conn) {
  const ov = require('../overview');
  const d = await ov.getOverview(conn);
  return d.hr;
}
module.exports = { key: 'hr', run };
