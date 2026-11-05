const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const { login, refresh } = require('../src/common/auth');
const { requirePerm } = require('../src/common/auth');
const { get, run } = require('../src/common/db');

test('auth1: login dung admin/Admin@123 tra access+refresh', async () => {
  const out = await login('admin', 'Admin@123');
  assert.ok(out.token && out.refresh);
  assert.equal(out.user.role, 'owner');
});

test('auth2: login sai mat khau -> AUTH 401', async () => {
  await assert.rejects(() => login('admin', 'sai-pass-xyz'), (e) => e.code === 'AUTH' && e.status === 401);
});

test('auth3: refresh xoay vong, refresh cu bi thu hoi', async () => {
  const out = await login('sale', 'User@123');
  const r1 = await refresh(out.refresh);
  assert.ok(r1.token && r1.refresh);
  await assert.rejects(() => refresh(out.refresh), (e) => e.code === 'AUTH');
});

test('auth4: sai 5 lan -> khoa 15p; RBAC warehouse khong debts-write', async () => {
  await run("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE username='kho'");
  for (let i = 0; i < 5; i++) {
    try { await login('kho', 'sai'); } catch {}
  }
  const u = await get("SELECT failed_attempts, locked_until FROM users WHERE username='kho'");
  assert.ok(u.failed_attempts >= 5 && u.locked_until, 'phai khoa sau 5 lan sai');
  await run("UPDATE users SET failed_attempts=0, locked_until=NULL WHERE username='kho'");
  const denied = await new Promise((resolve) => {
    requirePerm('debts.write')({ user: { role: 'warehouse' } }, {}, (err) => resolve(!!err));
  });
  assert.equal(denied, true);
});
