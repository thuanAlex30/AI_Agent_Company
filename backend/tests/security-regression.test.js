// security-regression.test.js — QA-04: bo regression an ninh.
//   SEC-01 / RBAC-SCOPE-001: scope theo phong ban + chong IDOR doi URL ID
//   SEC-02 / AUTH-REFRESH-RACE-001: xoay vong refresh token atomic + phat hien tai su dung lai
//   SEC-03 / SEC-PROXY-001: gia X-Forwarded-For khong bypass rate-limit
//   SEC-04 / AUTH-COOKIE-001: cookie production co HttpOnly + Secure + SameSite
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
require('./setup');

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/common/db');
const { resolveScope, canAccessDept, scopeFilter, enforceDept } = require('../src/common/scope');
const { resolveTrustProxy } = require('../src/common/security');

// ---------------------------------------------------------------------------
// SEC-01: scope theo phong ban
// ---------------------------------------------------------------------------
test('sec01: scope resolve — owner/ceo doc moi phong ban', () => {
  const s = resolveScope({ role: 'owner' });
  assert.equal(s.allDepts, true);
  const s2 = resolveScope({ role: 'ceo' });
  assert.equal(s2.allDepts, true);
});

test('sec01: vai ke toan chi doc phong ban finance', () => {
  const s = resolveScope({ role: 'accountant' });
  assert.equal(s.allDepts, false);
  assert.ok(s.depts.includes('finance'));
  assert.equal(s.depts.includes('sales'), false);
  assert.equal(canAccessDept({ role: 'accountant' }, 'finance'), true);
  assert.equal(canAccessDept({ role: 'accountant' }, 'sales'), false);
});

test('sec01: truong phong sales chi doc sales + khoi lien quan', () => {
  const user = { role: 'manager', dept_code: 'sales' };
  const s = resolveScope(user);
  assert.equal(s.allDepts, false);
  assert.ok(s.depts.includes('sales'), 'phai doc duoc phong ban cua minh');
  assert.equal(s.depts.includes('hr'), false, 'khong duoc doc phong ban HR');
  assert.equal(s.depts.includes('finance'), false, 'khong duoc doc phong ban tai chinh');
});

test('sec01: scopeFilter lo row ngoai phong ban', () => {
  const user = { role: 'hr', dept_code: 'hr' };
  const rows = [
    { code: 'HR01', dept_code: 'hr' },
    { code: 'SA01', dept_code: 'sales' },
    { code: 'FI01', dept_code: 'finance' },
  ];
  const out = scopeFilter(user, rows, 'dept_code');
  assert.equal(out.length, 1);
  assert.equal(out[0].code, 'HR01');
});

test('sec01: enforceDept nem 403 khi truy cap phong ban khac', () => {
  const user = { role: 'hr', dept_code: 'hr' };
  assert.throws(() => enforceDept(user, 'finance', 'nhan su'), (e) => e.status === 403);
  assert.doesNotThrow(() => enforceDept(user, 'hr', 'nhan su'));
});

test('sec01: doi URL ID khong vuot quyen (IDOR) — nhan vien HR khong doc nhan su phong ban khac', async () => {
  // Tao 2 nhan su o 2 phong ban
  const code = (p) => 'SEC01-' + p + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e4);
  const c1 = code('HR'), c2 = code('SA');
  await db.run("INSERT INTO employees(code,name,dept_code,title,status) VALUES(?,?,?,?,?)", [c1, 'NV HR', 'hr', 'Staff', 'active']);
  await db.run("INSERT INTO employees(code,name,dept_code,title,status) VALUES(?,?,?,?,?)", [c2, 'NV Sales', 'sales', 'Staff', 'active']);
  const other = await db.get('SELECT id FROM employees WHERE code=?', [c2]);

  // user gia lap: role hr, dept hr
  const fakeUser = { role: 'hr', dept_code: 'hr' };
  const { assertResourceScope } = require('../src/common/scope');
  await assert.rejects(
    () => assertResourceScope(null, fakeUser, 'employees', other.id),
    (e) => e.status === 403,
    'doc nhan su phong ban khac phai bi 403'
  );
  // va doc nhan su cung phong ban thi OK
  const own = await db.get('SELECT id FROM employees WHERE code=?', [c1]);
  await assert.doesNotReject(() => assertResourceScope(null, fakeUser, 'employees', own.id));
});

// ---------------------------------------------------------------------------
// SEC-02: refresh token rotation atomic + reuse detection
// ---------------------------------------------------------------------------
test('sec02: 10 lan refresh cung 1 token — toi da 1 lan thanh cong', async () => {
  const { login, refresh } = require('../src/common/auth');
  const out = await login('admin', 'Admin@123');
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => refresh(out.refresh))
  );
  const okCount = results.filter((r) => r.status === 'fulfilled').length;
  assert.ok(okCount <= 1, 'toi da 1 lan refresh thanh cong, thuc te: ' + okCount);
});

test('sec02: refresh token da thu hoi khong dung lai duoc', async () => {
  const { login, refresh } = require('../src/common/auth');
  const out = await login('admin', 'Admin@123');
  const rotated = await refresh(out.refresh);
  // Token cu (da xoay vong) phai bi tu choi
  await assert.rejects(() => refresh(out.refresh), (e) => e.status === 401);
  // Token moi van dung duoc
  const again = await refresh(rotated.refresh);
  assert.ok(again.token);
});

// ---------------------------------------------------------------------------
// SEC-03: proxy trust
// ---------------------------------------------------------------------------
test('sec03: resolveTrustProxy mac dinh = loopback (khong tin XFF tu client)', () => {
  const prev = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  assert.equal(resolveTrustProxy(), 'loopback');
  process.env.TRUST_PROXY = 'false';
  assert.equal(resolveTrustProxy(), false);
  process.env.TRUST_PROXY = '2';
  assert.equal(resolveTrustProxy(), 2);
  if (prev === undefined) delete process.env.TRUST_PROXY;
  else process.env.TRUST_PROXY = prev;
});

test('sec03: gia X-Forwarded-For khong doi duoc IP ma rate-limit su dung', async () => {
  // Rate-limit key phai dung req.ip (da qua proxy-trust), KHONG phai raw XFF.
  const { clientIp } = require('../src/common/security');
  const req = { ip: '10.0.0.5', socket: { remoteAddress: '10.0.0.5' }, headers: { 'x-forwarded-for': '1.2.3.4' } };
  assert.equal(clientIp(req), '10.0.0.5', 'phai dung IP server tin, khong dung XFF raw');
});

// ---------------------------------------------------------------------------
// SEC-04: cookie
// ---------------------------------------------------------------------------
test('sec04: cookie production co HttpOnly + Secure + SameSite phu hop', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  // Nap lai module de doc env moi
  for (const k of Object.keys(require.cache)) {
    if (k.includes(path.join('routes', 'auth')) || k.includes(path.join('common', 'auth'))) delete require.cache[k];
  }
  const authRoutes = require('../src/routes/auth');
  const express = require('express');
  const cookieParser = require('cookie-parser');
  const bcrypt = require('bcryptjs');
  const app2 = express();
  app2.use(express.json());
  app2.use(cookieParser());
  app2.use('/api/auth', authRoutes);

  // Tao user rieng cho test (khon phu thuoc mat khau trong DB dung chung).
  const uname = 'sec04_' + Date.now();
  const hash = await bcrypt.hash('Sec04@Passw0rd', 10);
  await db.run("INSERT INTO users(username,password_hash,role) VALUES(?,?,?)", [uname, hash, 'owner']);

  const r = await request(app2).post('/api/auth/login').send({ username: uname, password: 'Sec04@Passw0rd' });
  assert.equal(r.status, 200, 'login phai thanh cong: ' + JSON.stringify(r.body));
  const cookies = r.headers['set-cookie'] || [];
  assert.ok(cookies.length >= 2, 'phai set access_token + refresh_token');
  for (const c of cookies) {
    assert.match(c, /HttpOnly/i, 'cookie phai HttpOnly: ' + c);
    assert.match(c, /Secure/i, 'cookie production phai Secure: ' + c);
    assert.match(c, /SameSite/i, 'cookie phai co SameSite: ' + c);
  }
  process.env.NODE_ENV = prevEnv;
});