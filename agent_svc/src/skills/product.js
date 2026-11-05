async function run(conn) {
  const ov = require('../overview');
  const d = await ov.getOverview(conn);
  return d.product;
}
module.exports = { key: 'product', run };
