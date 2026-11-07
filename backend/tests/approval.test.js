const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { get, run } = require('../src/common/db');
const gov = require('../src/modules/governance/approvals');
const supplyService = require('../src/modules/supply/service');
const { ensureStockAll } = require('./helpers/stock');

const S = Date.now();

// BUG (TEST-ISO-01): ton kho bi tieu het giua cac file test (cung DB) =>
// receivePO fail "Kho khong du ..." tren PostgreSQL.
test.before(async () => {
  await ensureStockAll(['CF-SUA-01', 'BANH-01', 'TRA-DAO-01'], 500);
});

async function ensureUser(username, role, employee_code) {
  let u = await get('SELECT * FROM users WHERE username=?', [username]);
  if (!u) {
    const h = await bcrypt.hash('User@123', 10);
    await run('INSERT INTO users(employee_code,username,password_hash,role) VALUES(?,?,?,?)', [employee_code, username, h, role]);
    u = await get('SELECT * FROM users WHERE username=?', [username]);
  }
  return u;
}

test('appr1: tu duyet bi chan 403 (ke ca CEO)', async () => {
  const admin = await get("SELECT * FROM users WHERE username='admin'");
  const r = await gov.requestApproval(null, { ref_type: 'expense', ref_id: 1, requester: admin.id, level: 'manager' });
  await assert.rejects(
    () => gov.decideApproval(null, r.id, { decider: admin.id, decision: 'approved' }),
    (e) => e.status === 403 && /tu duyet/i.test(e.message)
  );
  await run('DELETE FROM approvals WHERE id=?', [r.id]);
});

test('appr2: sai level bi chan 403 (accountant khong duyet buoc manager)', async () => {
  const admin = await get("SELECT * FROM users WHERE username='admin'");
  const kt = await get("SELECT * FROM users WHERE username='ketoan'");
  const r = await gov.requestApproval(null, { ref_type: 'expense', ref_id: 1, requester: kt.id, level: 'manager' });
  await assert.rejects(
    () => gov.decideApproval(null, r.id, { decider: kt.id, decision: 'approved' }),
    (e) => e.status === 403
  );
  // ceo/owner duyet thay duoc
  const okR = await gov.decideApproval(null, r.id, { decider: admin.id, decision: 'approved' });
  assert.equal(okR.status, 'approved');
});

test('appr3: PO chua duyet -> receivePO bi chan APPROVAL_REQUIRED', async () => {
  const sup = await get("SELECT * FROM suppliers WHERE code='NCC01'");
  const po = await supplyService.createPO(null, { code: `POA-${S}`, supplier_id: sup.id, amount: 6000000, created_by: 'test' });
  await assert.rejects(
    () => supplyService.receivePO(null, po.id, { items: [{ sku: 'CF-SUA-01', qty: 1 }], actor: 'test' }),
    (e) => e.code === 'APPROVAL_REQUIRED'
  );
});

test('appr4: contract >=50tr can ca ceo + legal moi signed', async () => {
  const cust = await get("SELECT * FROM customers WHERE code='KH001'");
  const code = `HDA-${S}`;
  // BUG (PG-DB-04): `created_by` la cot BIGINT (ID nguoi). Truoc day test ghi
  // LITERAL 'test' => SQLite ghi tam chuoi vao cot BIGINT (du lieu sai, im
  // lang), PostgreSQL nem loi "invalid input syntax for type bigint".
  // => dung ID nguoi THAT (admin.id).
  const admin0 = await get("SELECT * FROM users WHERE username='admin'");
  await run('INSERT INTO contracts(code,customer_id,amount,status,created_by) VALUES(?,?,?,\'pending_approval\',?)', [code, cust.id, 60000000, admin0.id]);
  const ct = await get('SELECT * FROM contracts WHERE code=?', [code]);
  const admin = admin0;
  const mgr = await ensureUser('mgr_test', 'manager', 'MM001');
  // manager request 2 buoc: ceo + legal
  const a1 = await gov.requestApproval(null, { ref_type: 'contract', ref_id: ct.id, requester: mgr.id, level: 'ceo' });
  const a2 = await gov.requestApproval(null, { ref_type: 'contract', ref_id: ct.id, requester: mgr.id, level: 'legal' });
  await gov.decideApproval(null, a1.id, { decider: admin.id, decision: 'approved' });
  const mid = await get('SELECT * FROM contracts WHERE id=?', [ct.id]);
  assert.notEqual(mid.status, 'signed', 'thieu legal chua duoc signed');
  // legal user
  const legal = await ensureUser('legal_test', 'legal', 'LGAL01');
  await gov.decideApproval(null, a2.id, { decider: legal.id, decision: 'approved' });
  const fin = await get('SELECT * FROM contracts WHERE id=?', [ct.id]);
  assert.equal(fin.status, 'signed');
});

test('appr5: scheduler dung 5 cron VN + approval-matrix v6.1', async () => {
  const src = fs.readFileSync('src/common/scheduler.js', 'utf8');
  const n = (src.match(/cron\.schedule/g) || []).length;
  assert.equal(n, 5, 'phai co dung 5 cron, thay ' + n);
  for (const c of ['0 8 * * *', '*/5 * * * *', '0 2 * * *', '5 8 * * *', '30 3 * * *']) {
    assert.ok(src.includes(c), 'thieu cron ' + c);
  }
  assert.ok(src.includes('Asia/Ho_Chi_Minh'));
  const matrix = JSON.parse(fs.readFileSync('docs/contract/approval-matrix.json', 'utf8'));
  assert.equal(matrix.approval_matrix_version, 'v6.1');
  assert.ok(!JSON.stringify(matrix).includes('director/cfo'));
});
