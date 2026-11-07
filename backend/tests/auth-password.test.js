const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const bcrypt = require('bcryptjs');
const { changePassword, checkPasswordPolicy, login } = require('../src/common/auth');
const { get, run } = require('../src/common/db');

// SEC-11: doi mat khau chinh user — policy + auth_version + revoke + audit cung tx.
test('auth-pw1: policy tu choi mat khau yeu', async () => {
  await assert.rejects(() => Promise.resolve().then(() => checkPasswordPolicy('short1')), (e) => e.code === 'VALIDATION');
  await assert.rejects(() => Promise.resolve().then(() => checkPasswordPolicy('passwordonly')), (e) => e.code === 'VALIDATION');
  await assert.rejects(() => Promise.resolve().then(() => checkPasswordPolicy('12345678')), (e) => e.code === 'VALIDATION');
  assert.equal(checkPasswordPolicy('Newpass123'), 'Newpass123');
});

test('auth-pw2: doi mat khau thanh cong — bump auth_version + revoke all + audit', async () => {
  const uname = 'pwuser_' + String(Date.now()).slice(-6);
  const hash = await bcrypt.hash('Oldpass123', 10);
  await run('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)', [uname, hash, 'staff']);
  const u0 = await get('SELECT * FROM users WHERE username=?', [uname]);
  assert.ok(u0 && u0.id);
  const av0 = Number(u0.auth_version || 1);
  // Tao 1 session de kiem tra revoke.
  const l0 = await login(uname, 'Oldpass123');
  assert.ok(l0.refresh);
  const out = await changePassword(u0.id, 'Oldpass123', 'Newpass456');
  assert.equal(out.changed, true);
  const u1 = await get('SELECT * FROM users WHERE id=?', [u0.id]);
  assert.ok(Number(u1.auth_version) === av0 + 1, 'phai tang auth_version');
  assert.ok(await bcrypt.compare('Newpass456', u1.password_hash), 'password_hash moi phai dung');
  // Doi mat khau phai thu hoi TOAN BO session (khong dung ham date DB trong src/test de giu parity PG).
  const { query } = require('../src/common/db');
  const rows = await query(
    'SELECT id FROM refresh_tokens WHERE user_id=? AND revoked IS NOT TRUE', [u0.id]
  );
  assert.equal(rows.length, 0, 'doi mat khau phai thu hoi TOAN BO session');
  const audit = await get(
    "SELECT * FROM audit_log WHERE table_name='users' AND record_id=? AND action='security.password_change' ORDER BY id DESC LIMIT 1",
    [u0.id]
  );
  assert.ok(audit, 'phai co audit security.password_change cung transaction');
  // Mat khau cu khong login duoc, mat khau moi login duoc.
  await assert.rejects(() => login(uname, 'Oldpass123'), (e) => e.code === 'AUTH');
  const l1 = await login(uname, 'Newpass456');
  assert.ok(l1.token);
});

test('auth-pw3: sai mat khau cu -> 401; trung mat khau cu -> 400', async () => {
  const uname = 'pwuser2_' + String(Date.now()).slice(-6);
  const hash = await bcrypt.hash('Oldpass123', 10);
  await run('INSERT INTO users(username,password_hash,role) VALUES(?,?,?)', [uname, hash, 'staff']);
  const u = await get('SELECT * FROM users WHERE username=?', [uname]);
  await assert.rejects(() => changePassword(u.id, 'WrongOld1', 'Newpass789'), (e) => e.code === 'AUTH' && e.status === 401);
  await assert.rejects(() => changePassword(u.id, 'Oldpass123', 'Oldpass123'), (e) => e.code === 'VALIDATION');
  await assert.rejects(() => changePassword(u.id, 'Oldpass123', 'short1'), (e) => e.code === 'VALIDATION');
});
