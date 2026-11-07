const db = require('./src/common/db');
const sql = 'INSERT INTO approvals(ref_type,ref_id,requester,level,status,note) VALUES(?,?,?,?,?,?)';
console.log('table=', db.targetTable(sql));
console.log('cols=', JSON.stringify(db.NUMERIC_ID_COLUMNS.approvals));
console.log('norm=', JSON.stringify(db.normalizeParamsForSql(sql, ['contract', 1, 'test', 'ceo', 'pending', null])));
