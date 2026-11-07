const express = require('express');
const { authenticate, requirePerm, filterEmployeeRow } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run } = require('../common/db');
const { scopeFilter, enforceDept, assertResourceScope } = require('../common/scope');
const hr = require('../modules/hr/service');

const router = express.Router();
router.use(authenticate);

// SEC-01: doc nhan su — chi thay phong ban trong scope cua user.
// Truoc day chi filterEmployeeRow (an salary) chu chua gioi han theo phong ban.
router.get('/employees', requirePerm('hr.read'), async (req, res) => {
  try {
    const rows = await all('SELECT * FROM employees ORDER BY code LIMIT 500');
    const scoped = scopeFilter(req.user, rows, 'dept_code');
    return ok(res, scoped.map((r) => filterEmployeeRow(r, req.user.role)));
  } catch (e) { return fail(res, e); }
});
router.post('/employees', requirePerm('employees.write'), async (req, res) => {
  try {
    const { reqStr } = require('../common/validate');
    const code = reqStr(req.body, 'code', { max: 20 });
    const name = reqStr(req.body, 'name', { max: 200 });
    const dept = reqStr(req.body, 'dept_code');
    const title = reqStr(req.body, 'title', { max: 100 });
    // SEC-01: khong tao nhan su o phong ban ngoai scope (chi owner/ceo/HR duoc)
    enforceDept(req.user, dept, 'nhan su');
    // GOV-01: ghi du lieu + audit trong CUNG transaction -> khong the co
    // ban ghi nhung khong co audit (hoac nguoc lai).
    const { tx } = require('../common/db');
    const { writeAudit } = require('../common/audit');
    const out = await tx(async (c) => {
      const r = await c.run('INSERT INTO employees(code,name,dept_code,title,status) VALUES(?,?,?,?,?)', [code, name, dept, title, 'active']);
      const row = r.lastInsertRowid
        ? { id: r.lastInsertRowid }
        : (await c.get('SELECT id FROM employees WHERE code=?', [code]));
      await writeAudit(c, req.user.username, 'create', 'employees', row?.id, null, { code });
      return { id: row?.id, code };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

router.post('/attendance/checkin', requirePerm('attendance.checkin'), async (req, res) => {
  try {
    const { reqStr } = require('../common/validate');
    return ok(res, await hr.checkin(null, req.user, reqStr(req.body, 'employee_code')));
  } catch (e) { return fail(res, e); }
});
router.post('/attendance/checkout', requirePerm('attendance.checkin'), async (req, res) => {
  try {
    const { reqStr } = require('../common/validate');
    return ok(res, await hr.checkout(null, req.user, reqStr(req.body, 'employee_code')));
  } catch (e) { return fail(res, e); }
});
router.get('/hr/today', requirePerm('hr.read'), async (req, res) => {
  try { return ok(res, await hr.todayList(null, req.user)); }
  catch (e) { return fail(res, e); }
});
router.get('/hr/payroll-preview', requirePerm('hr.read'), async (req, res) => {
  try { return ok(res, await hr.payrollPreview(null, req.user, req.query.month)); }
  catch (e) { return fail(res, e); }
});
router.get('/recruitments', requirePerm('hr.read'), async (req, res) => {
  try {
    const rows = await all('SELECT * FROM recruitments ORDER BY id DESC LIMIT 100');
    return ok(res, scopeFilter(req.user, rows, 'dept_code'));
  } catch (e) { return fail(res, e); }
});
// API-01 / P1-07: truoc day INSERT co 4 placeholder nhung truyen 5 params
// (thiếu cost) -> SQLite/PG bao loi "5 arguments passed, 4 expected".
// Sua: them cot cost vao danh sach cot va truyen dung so tham so.
router.post('/recruitments', requirePerm('employees.write'), async (req, res) => {
  try {
    const { reqStr, reqIntPos } = require('../common/validate');
    const position = reqStr(req.body, 'position', { max: 200 });
    const dept = reqStr(req.body, 'dept_code');
    const qty = reqIntPos(req.body, 'qty') || 1;
    const cost = reqIntPos(req.body, 'cost', { optional: true, allowZero: true }) || 0;
    const opened = req.body.opened_date || new Date().toISOString().slice(0, 10);
    enforceDept(req.user, dept, 'tuyen dung');
    const { tx } = require('../common/db');
    const { writeAudit } = require('../common/audit');
    // GOV-01: ghi du lieu + audit trong CUNG transaction.
    const out = await tx(async (c) => {
      const r = await c.run(
        'INSERT INTO recruitments(position,dept_code,qty,status,opened_date,cost) VALUES(?,?,?,?,?,?)',
        [position, dept, qty, 'open', opened, cost]
      );
      const id = r.lastInsertRowid || (await c.get('SELECT id FROM recruitments WHERE position=? AND dept_code=? ORDER BY id DESC LIMIT 1', [position, dept]))?.id;
      await writeAudit(c, req.user.username, 'create', 'recruitments', id, null, { position, dept, qty, cost });
      return { id, position, dept, qty, cost };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/trainings', requirePerm('employees.write'), async (req, res) => {
  try {
    const { reqStr } = require('../common/validate');
    const employee_id = reqIntPosEmployee(req.body, 'employee_id');
    const topic = reqStr(req.body, 'topic', { max: 200 });
    const hours = req.body.hours || 1;
    // SEC-01: nhan vien trong phong ban khac -> 403
    await assertResourceScope(null, req.user, 'employees', employee_id);
    const r = await run('INSERT INTO trainings(employee_id,topic,hours,status) VALUES(?,?,?,?)', [employee_id, topic, hours, 'planned']);
    return ok(res, { id: r.lastInsertRowid });
  } catch (e) { return fail(res, e); }
});

function reqIntPosEmployee(body, key) {
  const { reqIntPos } = require('../common/validate');
  return reqIntPos(body, key);
}

module.exports = router;