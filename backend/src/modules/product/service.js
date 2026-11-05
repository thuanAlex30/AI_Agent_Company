const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');

// product so huu: product_features
async function list(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  return c.query('SELECT * FROM product_features ORDER BY id DESC LIMIT 200');
}
async function create(conn, { title, stage = 'idea', owner = null, actor = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!title) throw new AppError('VALIDATION', 'Feature can title', 400);
  if (!['idea', 'spec', 'building', 'testing', 'released'].includes(stage)) throw new AppError('VALIDATION', 'stage khong hop le', 400);
  const r = await c.run('INSERT INTO product_features(title,stage,owner) VALUES(?,?,?)', [title, stage, owner]);
  const id = r.lastInsertRowid || (await c.get('SELECT id FROM product_features ORDER BY id DESC LIMIT 1'))?.id;
  await writeAudit(c, actor || 'system', 'create', 'product_features', id, null, { title, stage });
  return { id };
}
async function setStage(conn, id, stage, actor) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!['idea', 'spec', 'building', 'testing', 'released'].includes(stage)) throw new AppError('VALIDATION', 'stage khong hop le', 400);
  const old = await c.get('SELECT * FROM product_features WHERE id=?', [id]);
  if (!old) throw new AppError('NOT_FOUND', 'Khong tim thay feature', 404);
  await c.run('UPDATE product_features SET stage=? WHERE id=?', [stage, id]);
  await writeAudit(c, actor || 'system', 'update', 'product_features', id, { stage: old.stage }, { stage });
  return { id, stage };
}
module.exports = { list, create, setStage };
