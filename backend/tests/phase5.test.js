// phase5.test.js — Phase 5 (P1-13): FRONTEND REFRESH QUEUE + CSRF + SCOPE.
//
//   p501: /api/auth/me tra scope (dept_code + depts) cho FE hien thi
//   p502: /api/auth/refresh xoay vong cookie va tra csrf_token moi
//   p503: csrfGuard — mutation khong co X-CSRF-Token => 403
//   p504: csrfGuard — mutation co X-CSRF-Token hop le => 200
//   p505: refresh token cu bi thu hoi (reuse) => 401 + thu hoi toan bo session
//   p506: /api/health tra version tu config (FE doc, khong hardcode)
const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/common/db');
const bcrypt = require('bcryptjs');

async function loginAs(username, password) {
  const r = await request(app).post('/api/auth/login').send({ username, password });
  assert.equal(r.status, 200, 'login fail ' + username + ': ' + JSON.stringify(r.body));
  return r;
}

/** User rieng cho test phase5 — tranh xung dot voi test file khac (reuse detection thu hoi TOAN BO session cua user). */
async function mkUser() {
  const username = 'p5_' + Date.now();
  const hash = await bcrypt.hash('P5@12345', 10);
  await db.run('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)', [username, hash, 'sales']);
  return { username, password: 'P5@12345' };
}

// ---------------------------------------------------------------------------
// p501: /api/auth/me tra scope cho FE
// ---------------------------------------------------------------------------
test('p501: /api/auth/me tra dept_code + scope de FE hien thi pham vi', async () => {
  const r = await loginAs('admin', 'Admin@123');
  const me = await request(app).get('/api/auth/me').set('Authorization', 'Bearer ' + r.body.data.token);
  assert.equal(me.status, 200);
  assert.ok(me.body.data.user, 'phai co user');
  assert.ok(Array.isArray(me.body.data.permissions), 'phai co permissions');
  assert.ok(me.body.data.scope, 'phai co scope');
  assert.ok('depts' in me.body.data.scope, 'scope phai co depts');
  assert.ok('all_depts' in me.body.data.scope, 'scope phai co all_depts');
});

// ---------------------------------------------------------------------------
// p502: /api/auth/refresh xoay vong cookie + tra csrf_token moi
// ---------------------------------------------------------------------------
test('p502: POST /api/auth/refresh xoay vong cookie va tra csrf_token moi', async () => {
  const u = await mkUser();
  const r = await loginAs(u.username, u.password);
  const csrf = r.body.data.csrf_token;
  assert.ok(csrf, 'login phai tra csrf_token');
  const cookies = r.headers['set-cookie'] || [];
  assert.ok(cookies.some((c) => c.startsWith('refresh_token=')), 'phai set cookie refresh_token');
  assert.ok(cookies.some((c) => c.startsWith('csrf_token=')), 'phai set cookie csrf_token');
  // csrf cookie KHONG httpOnly (FE phai doc duoc)
  const csrfCookie = cookies.find((c) => c.startsWith('csrf_token='));
  assert.ok(!/httponly/i.test(csrfCookie), 'csrf_token cookie KHONG httpOnly');
  // access/refresh cookie httpOnly
  const accCookie = cookies.find((c) => c.startsWith('access_token='));
  assert.ok(/httponly/i.test(accCookie), 'access_token cookie phai httpOnly');

  const cookieStr = cookies.map((c) => c.split(';')[0]).join('; ');
  const ref = await request(app).post('/api/auth/refresh').set('Cookie', cookieStr).send({});
  assert.equal(ref.status, 200, JSON.stringify(ref.body));
  assert.ok(ref.body.data.token && ref.body.data.refresh, 'refresh phai tra token moi');
  assert.ok(ref.body.data.csrf_token, 'refresh phai tra csrf_token moi');
  const newCookies = ref.headers['set-cookie'] || [];
  assert.ok(newCookies.some((c) => c.startsWith('refresh_token=')), 'phai xoay vong refresh cookie');
});

// ---------------------------------------------------------------------------
// p503: csrfGuard — mutation thieu X-CSRF-Token => 403
// ---------------------------------------------------------------------------
test('p503: mutation cookie-session thieu X-CSRF-Token bi 403 (CSRF guard)', async () => {
  const r = await loginAs('sale', 'User@123');
  const cookies = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  // KHONG gui header X-CSRF-Token
  const res = await request(app)
    .post('/api/leads')
    .set('Cookie', cookies)
    .send({ name: 'CSRF test', phone: '0900000001' });
  assert.equal(res.status, 403, 'phai 403 khi thieu CSRF, thay ' + res.status);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

// ---------------------------------------------------------------------------
// p504: csrfGuard — mutation co X-CSRF-Token hop le => 200
// ---------------------------------------------------------------------------
test('p504: mutation voi X-CSRF-Token hop le duoc phep', async () => {
  const r = await loginAs('sale', 'User@123');
  const cookies = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
  const csrf = r.body.data.csrf_token;
  const res = await request(app)
    .post('/api/leads')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', csrf)
    .send({ name: 'CSRF ok ' + Date.now(), phone: '0900000002' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.ok, true);

  // Token SAI => 403
  const bad = await request(app)
    .post('/api/leads')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', 'deadbeef'.repeat(8))
    .send({ name: 'CSRF bad', phone: '0900000003' });
  assert.equal(bad.status, 403, 'CSRF token sai phai 403');
});

// ---------------------------------------------------------------------------
// p505: reuse detection — refresh cu bi thu hoi => 401 + thu hoi toan bo session
// ---------------------------------------------------------------------------
test('p505: dung lai refresh token da xoay vong => 401 (reuse detection)', async () => {
  const u = await mkUser();
  const r = await loginAs(u.username, u.password);
  const old = r.body.data.refresh;
  // Xoay vong 1 lan => token cu bi revoked
  const first = await request(app).post('/api/auth/refresh').send({ refresh: old });
  assert.equal(first.status, 200);
  // Dung lai token cu => 401
  const second = await request(app).post('/api/auth/refresh').send({ refresh: old });
  assert.equal(second.status, 401, 'phai 401 khi reuse');
  // Token moi (vua xoay vong) cung bi thu hoi do reuse => 401
  const third = await request(app).post('/api/auth/refresh').send({ refresh: first.body.data.refresh });
  assert.equal(third.status, 401, 'reuse phai thu hoi TOAN BO session');
});

// ---------------------------------------------------------------------------
// p506: /api/health tra version tu config
// ---------------------------------------------------------------------------
test('p506: /api/health tra version tu config (FE doc, khong hardcode)', async () => {
  const r = await request(app).get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.ok(r.body.data.version, 'phai co version');
  assert.equal(r.body.data.version, require('../src/config').APP_VERSION);
});
