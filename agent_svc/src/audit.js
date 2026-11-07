const { AppError } = require('./errors');

/**
 * INV-2 / GOV-01 (parity backend): audit PHAI ghi trong CUNG transaction.
 * Truoc day cho phep writeAudit(null,...) + warn => co the mat audit.
 * Bay gio fail-closed: thieu conn => throw GOV 500.
 */
async function writeAudit(conn, actor, action, table, recordId, oldJson, newJson) {
  const oldS = oldJson == null ? null : (typeof oldJson === 'string' ? oldJson : JSON.stringify(oldJson));
  const newS = newJson == null ? null : (typeof newJson === 'string' ? newJson : JSON.stringify(newJson));
  if (!conn || typeof conn.run !== 'function') {
    throw new AppError('GOV', 'writeAudit phai chay trong transaction (INV-2)', 500);
  }
  await conn.run(
    'INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)',
    [String(actor || 'system'), action, table, recordId, oldS, newS]
  );
  return true;
}

module.exports = { writeAudit };
