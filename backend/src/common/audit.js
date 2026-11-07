const { AppError } = require('./errors');
const logger = require('./logger');

/**
 * INV-2 / GOV-01: audit PHẢI ghi trong CÙNG transaction với dữ liệu nghiệp vụ.
 *
 * TRƯỚC ĐÂY: `writeAudit(null, ...)` ghi ra ngoài transaction (module-level
 * `run()`) và chỉ log warning. => Có thể tồn tại bản ghi KHÔNG có audit
 * (nếu tx rollback sau khi audit ghi) => vi phạm "không thể bỏ reu".
 *
 * BÂY GIỜ: thiếu `conn` => ném lỗi 500. Mọi service phải tự bọc `tx`.
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
