const { get, run } = require('./db');
const logger = require('./logger');

async function writeAudit(conn, actor, action, table, recordId, oldJson, newJson) {
  const oldS = oldJson == null ? null : (typeof oldJson === 'string' ? oldJson : JSON.stringify(oldJson));
  const newS = newJson == null ? null : (typeof newJson === 'string' ? newJson : JSON.stringify(newJson));
  if (conn && typeof conn.run === 'function') {
    await conn.run(
      'INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)',
      [String(actor || 'system'), action, table, recordId, oldS, newS]
    );
    return;
  }
  await run(
    'INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)',
    [String(actor || 'system'), action, table, recordId, oldS, newS]
  );
  logger.warn('writeAudit ngoai transaction', { table, recordId });
}

module.exports = { writeAudit };
