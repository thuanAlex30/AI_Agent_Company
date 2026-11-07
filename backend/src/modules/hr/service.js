const fs = require('fs');
const path = require('path');
const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { todayVN } = require('../../common/db');
const { filterEmployeeRow } = require('../../common/auth');

// hr so huu: attendance/employees/recruitments/trainings. CAM write users/refresh_tokens.
function canCheckinFor(reqUser, employeeCode) {
  if (!reqUser) throw new AppError('AUTH', 'Chua dang nhap', 401);
  const role = reqUser.role;
  if (reqUser.employee_code && reqUser.employee_code === employeeCode) return true;
  if (['hr', 'manager', 'director', 'ceo', 'owner'].includes(role)) return true;
  throw new AppError('FORBIDDEN', 'Khong duoc cham ho (403)', 403);
}

function vnNowParts() {
  const s = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
  // "2026-11-05, 21:30:00" hoac "2026-11-05 21:30:00"
  const m = s.match(/(\d{4}-\d{2}-\d{2}).*?(\d{2}):(\d{2})/);
  return { date: m ? m[1] : todayVN(), hh: m ? Number(m[2]) : 0, mm: m ? Number(m[3]) : 0 };
}

async function checkin(conn, reqUser, employeeCode) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  canCheckinFor(reqUser, employeeCode);
  const emp = await c.get('SELECT * FROM employees WHERE code=?', [employeeCode]);
  if (!emp) throw new AppError('NOT_FOUND', 'Khong tim thay nhan vien ' + employeeCode, 404);
  const { date, hh, mm } = vnNowParts();
  const late = hh > 8 || (hh === 8 && mm > 30);
  const t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  const ex = await c.get('SELECT * FROM attendance WHERE employee_id=? AND work_date=?', [emp.id, date]);
  if (ex) {
    await c.run('UPDATE attendance SET check_in=?, status=? WHERE id=?', [t, late ? 'late' : 'present', ex.id]);
    await writeAudit(c, reqUser.username, 'update', 'attendance', ex.id, { check_in: ex.check_in }, { check_in: t });
    return { id: ex.id, work_date: date, status: late ? 'late' : 'present' };
  }
  const r = await c.run('INSERT INTO attendance(employee_id,work_date,check_in,status) VALUES(?,?,?,?) ON CONFLICT(employee_id,work_date) DO NOTHING', [emp.id, date, t, late ? 'late' : 'present']);
  const id = r.lastInsertRowid || (await c.get('SELECT id FROM attendance WHERE employee_id=? AND work_date=?', [emp.id, date]))?.id;
  await writeAudit(c, reqUser.username, 'create', 'attendance', id, null, { employee_code: employeeCode, work_date: date });
  return { id, work_date: date, status: late ? 'late' : 'present' };
}

async function checkout(conn, reqUser, employeeCode) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  canCheckinFor(reqUser, employeeCode);
  const emp = await c.get('SELECT * FROM employees WHERE code=?', [employeeCode]);
  if (!emp) throw new AppError('NOT_FOUND', 'Khong tim thay nhan vien ' + employeeCode, 404);
  const { date, hh, mm } = vnNowParts();
  const t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
  const ex = await c.get('SELECT * FROM attendance WHERE employee_id=? AND work_date=?', [emp.id, date]);
  if (!ex) throw new AppError('VALIDATION', 'Chua checkin hom nay', 400);
  await c.run('UPDATE attendance SET check_out=? WHERE id=?', [t, ex.id]);
  await writeAudit(c, reqUser.username, 'update', 'attendance', ex.id, { check_out: ex.check_out }, { check_out: t });
  return { id: ex.id, check_out: t };
}

async function todayList(conn, reqUser) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const { date } = vnNowParts();
  const rows = await c.query('SELECT a.*, e.code AS employee_code, e.name, e.dept_code, e.salary_base FROM attendance a JOIN employees e ON e.id=a.employee_id WHERE a.work_date=? ORDER BY e.code', [date]);
  return rows.map((r) => filterEmployeeRow(r, reqUser.role));
}

// payroll-preview US-HR-02: salary_base/26 x present thang (present+late), loc luong backend
async function payrollPreview(conn, reqUser, month) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const m = month || todayVN().slice(0, 7);
  // DB-05: work_date la kieu DATE. SQLite substr(DATE,1,7) hoat dong nhung
  // PostgreSQL thi loi (date khong phai text). CAST(... AS TEXT) cho ra
  // 'YYYY-MM-DD' o ca hai dialect -> substr(... ,1,7) ra 'YYYY-MM'.
  const rows = await c.query(
    "SELECT e.code AS employee_code, e.name, e.dept_code, e.salary_base, COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS present_days FROM employees e LEFT JOIN attendance a ON a.employee_id=e.id AND substr(CAST(a.work_date AS TEXT),1,7)=? WHERE e.status IN ('active','probation') GROUP BY e.id ORDER BY e.code",
    [m]
  );
  return rows.map((r) => {
    const gross = Math.round(Number(r.salary_base || 0) / 26 * Number(r.present_days || 0));
    return filterEmployeeRow({ ...r, month: m, payroll_preview: gross }, reqUser.role);
  });
}

module.exports = { checkin, checkout, todayList, payrollPreview, canCheckinFor };
