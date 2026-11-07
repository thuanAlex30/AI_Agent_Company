const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { insertedId } = require('../../common/db');

// risk so huu: risks
async function list(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  return c.query('SELECT * FROM risks ORDER BY id DESC LIMIT 200');
}
async function create(conn, { title, level = 'medium', owner = null, due_date = null, actor = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!title) throw new AppError('VALIDATION', 'Risk can title', 400);
  if (!['low', 'medium', 'high', 'critical'].includes(level)) throw new AppError('VALIDATION', 'level khong hop le', 400);
  const r = await c.run("INSERT INTO risks(title,level,owner,status,due_date) VALUES(?,?,?,'open',?)", [title, level, owner, due_date]);
  const id = insertedId(r, 'risks');
  await writeAudit(c, actor || 'system', 'create', 'risks', id, null, { title, level });
  return { id };
}
async function setStatus(conn, id, status, actor) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!['open', 'mitigating', 'closed'].includes(status)) throw new AppError('VALIDATION', 'status risk khong hop le', 400);
  const old = await c.get('SELECT * FROM risks WHERE id=?', [id]);
  if (!old) throw new AppError('NOT_FOUND', 'Khong tim thay risk', 404);
  await c.run('UPDATE risks SET status=? WHERE id=?', [status, id]);
  await writeAudit(c, actor || 'system', 'update', 'risks', id, { status: old.status }, { status });
  return { id, status };
}
module.exports = { list, create, setStatus };
