// scope-v2.test.js — Phase 3 (P0-3/4/5 + P2-19): SCOPE V2 theo phong ban.
//
// YEU CAU §4.7 cua prompt:
//   sec01d: manager sales KHONG doc duoc don phong ban khac
//   sec01e: warehouse KHONG doc duoc don cua phong ban khac
//   sec01f: manager sales doi URL id don cua phong ban khac → 403
//   sec01g: accountant KHONG thay doi duoc don hang (IDOR)
//   sec01h: overview chi tra KPI trong scope (khong lo AR/DSO cho kho)
//   sec01i: audit doc chi thay ban ghi trong scope
//   sec01j: user khong co employee_code → fail-closed (khong xem het)
//   sec01k: scopeFilter voi row khong co dept → bi lo (fail-closed)
const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/common/db');
const bcrypt = require('bcryptjs');
const { resolveScope, scopeFilter, enforceDept, assertBusinessScope } = require('../src/common/scope');
const { setBusinessScope } = require('../src/common/scope');

const UNIQ = Date.now();

// ---------------------------------------------------------------------------
// Helper: tao user + employee de test scope that (theo phong ban).
// ---------------------------------------------------------------------------
async function mkUser({ username, role, empCode, empName, dept, title }) {
  const hash = await bcrypt.hash('Scope@12345', 10);
  await db.run(
    'INSERT INTO employees(code,name,dept_code,title,status) VALUES(?,?,?,?,?)',
    [empCode, empName, dept, title, 'active']
  );
  const emp = await db.get('SELECT id FROM employees WHERE code=?', [empCode]);
  await db.run(
    'INSERT INTO users(employee_code,username,password_hash,role) VALUES(?,?,?,?)',
    [empCode, username, hash, role]
  );
  const u = await db.get('SELECT * FROM users WHERE username=?', [username]);
  const r = await request(app).post('/api/auth/login').send({ username, password: 'Scope@12345' });
  assert.equal(r.status, 200, 'login fail cho ' + username + ': ' + JSON.stringify(r.body));
  return { token: r.body.data.token, userId: u.id, empId: emp.id, dept };
}

async function mkOrder({ code, empId, customerId, amount = 1000000 }) {
  await db.run(
    'INSERT INTO customers(code,name,phone,type,owner_employee_id) VALUES(?,?,?,?,?)',
    [code + '-C', 'KH ' + code, '0900' + String(Math.floor(Math.random() * 1e7)).slice(0, 7), 'retail', empId]
  );
  const cust = await db.get('SELECT id FROM customers WHERE code=?', [code + '-C']);
  await db.run(
    `INSERT INTO orders(code,customer_id,employee_id,amount,status,order_date,created_by)
     VALUES(?,?,?,?,'pending',?,1)`,
    [code, cust.id, empId, amount, new Date().toISOString().slice(0, 10)]
  );
  const o = await db.get('SELECT * FROM orders WHERE code=?', [code]);
  return o;
}

// ---------------------------------------------------------------------------
// sec01d: manager sales chi thay don trong scope sales
// ---------------------------------------------------------------------------
test('sec01d: manager sales chi doc duoc don trong pham vi scope', async () => {
  const mgr = await mkUser({
    username: 'scope_mgr_' + UNIQ, role: 'manager',
    empCode: 'SCM' + UNIQ, empName: 'Mgr Sales', dept: 'sales', title: 'Manager',
  });
  const otherEmp = await db.get("SELECT id FROM employees WHERE dept_code='finance' LIMIT 1");

  const mine = await mkOrder({ code: 'SC-D-' + UNIQ, empId: mgr.empId });
  const theirs = await mkOrder({ code: 'SC-F-' + UNIQ, empId: otherEmp.id });

  // Ghi resource_dept theo quy tac 4.2 (dept cua employee_id).
  const { resolveResourceDept } = require('../src/common/scope');
  await setBusinessScope(null, 'orders', mine.id, await resolveResourceDept(null, 'orders', { ownerEmployeeId: mgr.empId }));
  await setBusinessScope(null, 'orders', theirs.id, await resolveResourceDept(null, 'orders', { ownerEmployeeId: otherEmp.id }));

  const r = await request(app).get('/api/orders').set('Authorization', 'Bearer ' + mgr.token);
  assert.equal(r.status, 200, 'GET /api/orders phai 200: ' + JSON.stringify(r.body));
  const codes = (r.body.data || []).map((o) => o.code);
  assert.ok(codes.includes(mine.code), 'phai thay don cua phong ban minh');
  assert.equal(codes.includes(theirs.code), false, 'KHONG duoc thay don phong ban khac');
});

// ---------------------------------------------------------------------------
// sec01e: warehouse chi thay don trong scope supply/ops
// ---------------------------------------------------------------------------
test('sec01e: warehouse KHONG doc duoc don cua phong ban khac', async () => {
  const wh = await mkUser({
    username: 'scope_wh_' + UNIQ, role: 'warehouse',
    empCode: 'SCW' + UNIQ, empName: 'Kho', dept: 'supply', title: 'Warehouse',
  });
  const salesEmp = await db.get("SELECT id FROM employees WHERE dept_code='sales' LIMIT 1");
  const o = await mkOrder({ code: 'SC-W-' + UNIQ, empId: salesEmp.id });
  const { resolveResourceDept } = require('../src/common/scope');
  await setBusinessScope(null, 'orders', o.id, await resolveResourceDept(null, 'orders', { ownerEmployeeId: salesEmp.id }));

  const r = await request(app).get('/api/orders').set('Authorization', 'Bearer ' + wh.token);
  assert.equal(r.status, 200);
  const codes = (r.body.data || []).map((x) => x.code);
  assert.equal(codes.includes(o.code), false, 'kho khong duoc thay don sales');
});

// ---------------------------------------------------------------------------
// sec01f: manager sales doi URL id don phong ban khac → 403
// ---------------------------------------------------------------------------
test('sec01f: doi URL id don cua phong ban khac → 403', async () => {
  const mgr = await mkUser({
    username: 'scope_mgr2_' + UNIQ, role: 'manager',
    empCode: 'SCM2' + UNIQ, empName: 'Mgr Sales 2', dept: 'sales', title: 'Manager',
  });
  const otherEmp = await db.get("SELECT id FROM employees WHERE dept_code='finance' LIMIT 1");
  const o = await mkOrder({ code: 'SC-IDOR-' + UNIQ, empId: otherEmp.id });
  const { resolveResourceDept } = require('../src/common/scope');
  await setBusinessScope(null, 'orders', o.id, await resolveResourceDept(null, 'orders', { ownerEmployeeId: otherEmp.id }));

  const r = await request(app).get('/api/customers/' + (await db.get('SELECT customer_id FROM orders WHERE id=?', [o.id])).customer_id)
    .set('Authorization', 'Bearer ' + mgr.token);
  assert.equal(r.status, 403, 'IDOR doc KH phong ban khac phai 403, thuc te: ' + r.status);

  // Don khac cung phai 403 khi doi URL id.
  const r2 = await request(app).post('/api/orders/' + o.id + '/cancel')
    .set('Authorization', 'Bearer ' + mgr.token);
  assert.equal(r2.status, 403, 'IDOR huy don phong ban khac phai 403, thuc te: ' + r2.status);
});

// ---------------------------------------------------------------------------
// sec01g: accountant KHONG sua duoc don hang
// ---------------------------------------------------------------------------
test('sec01g: accountant khong thay doi duoc don hang (IDOR)', async () => {
  const acc = await mkUser({
    username: 'scope_acc_' + UNIQ, role: 'accountant',
    empCode: 'SCA' + UNIQ, empName: 'Ke toan', dept: 'finance', title: 'Accountant',
  });
  const salesEmp = await db.get("SELECT id FROM employees WHERE dept_code='sales' LIMIT 1");
  const o = await mkOrder({ code: 'SC-ACC-' + UNIQ, empId: salesEmp.id });
  const { resolveResourceDept } = require('../src/common/scope');
  await setBusinessScope(null, 'orders', o.id, await resolveResourceDept(null, 'orders', { ownerEmployeeId: salesEmp.id }));

  const r = await request(app).post('/api/orders/' + o.id + '/refund')
    .set('Authorization', 'Bearer ' + acc.token);
  assert.equal(r.status, 403, 'ke toan khong duoc refund don phong ban khac');
  // Ke toan KHONG co quyen orders.write nen 403 truoc ca khi check scope.
  const st = await db.get('SELECT status FROM orders WHERE id=?', [o.id]);
  assert.equal(st.status, 'pending', 'trang thai don phai khong doi');
});

// ---------------------------------------------------------------------------
// sec01h: overview chi tra KPI trong scope
// ---------------------------------------------------------------------------
test('sec01h: overview chi tra KPI trong scope (kho khong thay AR/DSO)', async () => {
  const wh = await mkUser({
    username: 'scope_wh2_' + UNIQ, role: 'warehouse',
    empCode: 'SCW2' + UNIQ, empName: 'Kho 2', dept: 'supply', title: 'Warehouse',
  });
  const r = await request(app).get('/api/departments/overview').set('Authorization', 'Bearer ' + wh.token);
  assert.equal(r.status, 200, 'overview phai 200: ' + JSON.stringify(r.body));
  const d = r.body.data || {};
  assert.equal(d.finance && d.finance.hidden, true, 'kho khong duoc thay khoi finance');
  assert.equal(d.hr && d.hr.hidden, true, 'kho khong duoc thay khoi hr');
  assert.equal(d.sales && d.sales.hidden, true, 'kho khong duoc thay khoi sales');
  assert.ok(d.ops, 'kho van thay khoi ops');
  assert.ok(r.headers['x-scope-depts'], 'phai co header X-Scope-Depts de audit');
  assert.ok(!String(r.headers['x-scope-depts']).includes('finance'), 'scope phong ban kho khong gom finance');
});

// ---------------------------------------------------------------------------
// sec01i: audit doc chi thay ban ghi trong scope
// ---------------------------------------------------------------------------
test('sec01i: audit doc chi thay ban ghi trong scope', async () => {
  // audit.read chi co cfo/ceo/legal/owner => dung cfo (dept finance).
  const cfo = await mkUser({
    username: 'scope_cfo_' + UNIQ, role: 'cfo',
    empCode: 'SCC' + UNIQ, empName: 'CFO', dept: 'finance', title: 'CFO',
  });
  const finEmp = await db.get("SELECT id FROM employees WHERE dept_code='finance' LIMIT 1");
  const salesEmp = await db.get("SELECT id FROM employees WHERE dept_code='sales' LIMIT 1");
  const inScope = await mkOrder({ code: 'SC-AUD-F-' + UNIQ, empId: finEmp.id });
  const outScope = await mkOrder({ code: 'SC-AUD-S-' + UNIQ, empId: salesEmp.id });
  const { resolveResourceDept } = require('../src/common/scope');
  await setBusinessScope(null, 'orders', inScope.id, await resolveResourceDept(null, 'orders', { ownerEmployeeId: finEmp.id }));
  await setBusinessScope(null, 'orders', outScope.id, await resolveResourceDept(null, 'orders', { ownerEmployeeId: salesEmp.id }));
  // Audit cho ban ghi ngoai scope.
  await db.run(
    'INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)',
    ['someone', 'create', 'orders', outScope.id, null, JSON.stringify({ x: 1 })]
  );
  const r = await request(app).get('/api/audit').set('Authorization', 'Bearer ' + cfo.token);
  assert.equal(r.status, 200, 'audit phai 200: ' + JSON.stringify(r.body));
  const rows = r.body.data || [];
  assert.equal(rows.some((x) => x.table_name === 'orders' && Number(x.record_id) === outScope.id), false,
    'audit cua ban ghi ngoai scope khong duoc tra ve');
});

// ---------------------------------------------------------------------------
// sec01j: user khong co employee_code → fail-closed
// ---------------------------------------------------------------------------
test('sec01j: user khong gan phong ban → fail-closed (khong xem het du lieu nghiep vu)', async () => {
  const hash = await bcrypt.hash('Scope@12345', 10);
  const uname = 'scope_orphan_' + UNIQ;
  await db.run('INSERT INTO users(employee_code,username,password_hash,role) VALUES(?,?,?,?)',
    [null, uname, hash, 'staff']);
  const r = await request(app).post('/api/auth/login').send({ username: uname, password: 'Scope@12345' });
  assert.equal(r.status, 200);
  const token = r.body.data.token;

  // /api/orders phai 403 (staff co orders.read nhung role 'multi' + khong dept).
  const r2 = await request(app).get('/api/orders').set('Authorization', 'Bearer ' + token);
  assert.equal(r2.status, 403, 'user khong dept phai 403, thuc te: ' + r2.status);

  // resolveScope phai danh dau denied.
  const s = resolveScope({ role: 'staff' });
  assert.equal(s.denied, true, 'resolveScope phai fail-closed');
  assert.equal(s.allDepts, false, 'khong duoc coi nhu doc het');
});

// ---------------------------------------------------------------------------
// sec01k: scopeFilter bo row khong co dept (fail-closed)
// ---------------------------------------------------------------------------
test('sec01k: scopeFilter bo row khong co dept_code (fail-closed)', () => {
  const user = { role: 'manager', dept_code: 'sales' };
  const rows = [
    { code: 'A', dept_code: 'sales' },
    { code: 'B', dept_code: null },
    { code: 'C', dept_code: '' },
    { code: 'D' },
  ];
  const out = scopeFilter(user, rows, 'dept_code');
  assert.equal(out.length, 1, 'chi giu row co dept trong scope');
  assert.equal(out[0].code, 'A');
});

// ---------------------------------------------------------------------------
// sec01l: assertBusinessScope fail-closed khi ban ghi khong co dong resource_dept
// ---------------------------------------------------------------------------
test('sec01l: assertBusinessScope fail-closed khi khong xac dinh duoc phong ban', async () => {
  const mgr = { role: 'manager', dept_code: 'sales' };
  await assert.rejects(
    () => assertBusinessScope(null, mgr, 'orders', 99999999),
    (e) => e.status === 403,
    'ban ghi khong co resource_dept phai bi 403 (fail-closed), khong im lang bo qua'
  );
});

// ---------------------------------------------------------------------------
// sec01m: /api/auth/me tra dept_code + scope.depts
// ---------------------------------------------------------------------------
test('sec01m: GET /api/auth/me tra dept_code + scope', async () => {
  const mgr = await mkUser({
    username: 'scope_me_' + UNIQ, role: 'manager',
    empCode: 'SCM4' + UNIQ, empName: 'Mgr Sales 4', dept: 'sales', title: 'Manager',
  });
  const r = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + mgr.token);
  assert.equal(r.status, 200);
  const d = r.body.data || {};
  assert.equal(d.dept_code, 'sales', 'phai tra dept_code');
  assert.ok(d.scope, 'phai tra scope');
  assert.ok(Array.isArray(d.scope.depts), 'scope.depts phai la mang');
  assert.ok(d.scope.depts.includes('sales'));
});
