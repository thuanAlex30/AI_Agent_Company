const express = require('express');
const { authenticate, requirePerm, filterEmployeeRow } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run } = require('../common/db');
const hr = require('../modules/hr/service');

const router = express.Router();
router.use(authenticate);

router.get('/employees', requirePerm('hr.read'), async (req, res) => {
  try {
    const rows = await all('SELECT * FROM employees ORDER BY code LIMIT 200');
    return ok(res, rows.map((r) => filterEmployeeRow(r, req.user.role)));
  } catch (e) { return fail(res, e); }
});
router.post('/employees', requirePerm('employees.write'), async (req, res) => {
  try {
    const { reqStr } = require('../common/validate');
    const code = reqStr(req.body, 'code', { max: 20 });
    const name = reqStr(req.body, 'name', { max: 200 });
    const dept = reqStr(req.body, 'dept_code');
    const title = reqStr(req.body, 'title', { max: 100 });
    await run('INSERT INTO employees(code,name,dept_code,title,status) VALUES(?,?,?,?,?) ON CONFLICT(code) DO NOTHING', [code, name, dept, title, 'active']);
    const row = await get('SELECT * FROM employees WHERE code=?', [code]);
    const { writeAudit } = require('../common/audit');
    await writeAudit(null, req.user.username, 'create', 'employees', row.id, null, { code });
    return ok(res, { id: row.id, code });
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
  try { return ok(res, await all('SELECT * FROM recruitments ORDER BY id DESC LIMIT 100')); }
  catch (e) { return fail(res, e); }
});
router.post('/recruitments', requirePerm('employees.write'), async (req, res) => {
  try {
    const r = await run('INSERT INTO recruitments(position,dept_code,qty,status,opened_date) VALUES(?,?,?,?)', [req.body.position, req.body.dept_code, req.body.qty || 1, 'open', new Date().toISOString().slice(0, 10)]);
    return ok(res, { id: r.lastInsertRowid });
  } catch (e) { return fail(res, e); }
});
router.post('/trainings', requirePerm('employees.write'), async (req, res) => {
  try {
    const r = await run('INSERT INTO trainings(employee_id,topic,hours,status) VALUES(?,?,?,?)', [req.body.employee_id, req.body.topic, req.body.hours || 1, 'planned']);
    return ok(res, { id: r.lastInsertRowid });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
