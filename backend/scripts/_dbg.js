const { Pool } = require('pg');
const pool = new Pool({ host: process.env.PG_HOST, port: process.env.PG_PORT || 5432, user: process.env.PG_USER, password: process.env.PG_PASSWORD, database: process.env.PG_DB });
const origQuery = pool.query.bind(pool);
pool.query = async function (sql, params) {
  try {
    return await origQuery(sql, params);
  } catch (e) {
    console.error('FAILED SQL >>>', sql);
    console.error('PARAMS >>>', JSON.stringify(params));
    console.error('ERR >>>', e.code, e.message);
    throw e;
  }
};
const db = require('../src/common/db');
const supplyService = require('../src/modules/supply/service');

(async () => {
  const p = await db.get('SELECT * FROM products WHERE sku=?', ['CF-SUA-01']);
  console.log('product', p && p.sku);
  try {
    const r = await supplyService.moveStock(null, { sku: 'CF-SUA-01', type: 'out', qty: -1, ref_code: 'DBG1', created_by: null, actor: 'dbg' });
    console.log('OK', r);
  } catch (e) {
    console.error('ERR2', e.code, e.message);
  }
  process.exit(0);
})();
