const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { insertedId } = require('../../common/db');

// qa so huu: qa_checks
async function list(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  return c.query('SELECT * FROM qa_checks ORDER BY id DESC LIMIT 200');
}
async function create(conn, { ref_type, ref_id, result, defect = null, repeat_of = null, checker = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!['order', 'shipment', 'product'].includes(ref_type)) throw new AppError('VALIDATION', 'ref_type khong hop le', 400);
  if (!['pass', 'fail'].includes(result)) throw new AppError('VALIDATION', 'result pass/fail', 400);
  const r = await c.run('INSERT INTO qa_checks(ref_type,ref_id,result,defect,repeat_of,checker) VALUES(?,?,?,?,?,?)', [ref_type, ref_id, result, defect, repeat_of, checker]);
  const id = insertedId(r, 'qa_checks');
  await writeAudit(c, checker || 'system', 'create', 'qa_checks', id, null, { ref_type, ref_id, result });
  return { id };
}
async function stats(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const total = await c.get('SELECT COUNT(*) c FROM qa_checks');
  const fail = await c.get("SELECT COUNT(*) c FROM qa_checks WHERE result='fail'");
  const repeat = await c.get('SELECT COUNT(*) c FROM qa_checks WHERE repeat_of IS NOT NULL');
  const t = Number(total?.c || 0);
  return { total: t, fail: Number(fail?.c || 0), defect_rate: t ? Math.round(Number(fail?.c || 0) / t * 1000) / 10 : 0, repeat: Number(repeat?.c || 0) };
}
module.exports = { list, create, stats };
