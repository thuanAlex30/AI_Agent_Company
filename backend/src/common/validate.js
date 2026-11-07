const { AppError } = require('./errors');

function reqStr(body, field, opts = {}) {
  const v = body[field];
  if (v == null || String(v).trim() === '') {
    if (opts.optional) return undefined;
    throw new AppError('VALIDATION', `Thieu truong ${field}`, 400, { fields: [field] });
  }
  const s = String(v).trim();
  if (opts.max && s.length > opts.max) throw new AppError('VALIDATION', `Truong ${field} qua dai`, 400, { fields: [field] });
  if (opts.enum && !opts.enum.includes(s)) throw new AppError('VALIDATION', `Truong ${field} khong hop le`, 400, { fields: [field], allowed: opts.enum });
  return s;
}
function reqIntPos(body, field, opts = {}) {
  const v = body[field];
  if (v == null || v === '') {
    if (opts.optional) return undefined;
    throw new AppError('VALIDATION', `Thieu truong ${field}`, 400, { fields: [field] });
  }
  const n = Number(v);
  // allowZero: cho phep 0 (vi du chi phi tuyen dung = 0).
  // So am van bi tu choi (chi phi/so luong khong the am).
  if (!Number.isInteger(n) || n < 0 || (!opts.allowZero && n === 0)) {
    throw new AppError('VALIDATION', `Truong ${field} phai la so nguyen duong (${opts.allowZero ? '>= 0' : '> 0'})`, 400, { fields: [field] });
  }
  return n;
}
function reqCode(body, field = 'code') {
  const s = reqStr(body, field, { max: 32 });
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new AppError('VALIDATION', `Ma ${field} chi gom chu/so/-/ _`, 400, { fields: [field] });
  return s;
}
async function employeeIdByCode(dbOrConn, employeeCode) {
  const row = await dbOrConn.get('SELECT id FROM employees WHERE code=?', [employeeCode]);
  if (!row) throw new AppError('VALIDATION', `Khong tim thay nhan vien ${employeeCode}`, 400, { fields: ['employee_code'] });
  return row.id;
}

module.exports = { reqStr, reqIntPos, reqCode, employeeIdByCode };
