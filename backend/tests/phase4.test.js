// phase4.test.js — Phase 4 (P1-6..P1-21): LOGIC NGHIEP VU, TRANSACTION, AUDIT.
//
//   p401: cap duyet tinh TU approval-matrix.json (client ep cap => 400)
//   p402: cap duyet BO SUNG (legal) + khong signed khi thieu legal
//   p403: ORDER_FLOW state machine — chuyen trang thai sai => 400
//   p404: setOrderPaid qua `partial` truoc `paid` (khong bo qua buoc giao hang)
//   p405: storefront het hang => 409 + KHONG tao don ma
//   p406: IT_FLOW state machine + qa validate ref_id
//   p407: moi mutation co audit trong cung transaction (INV-2)
//   p408: import-csv dem imported/skipped theo `changes` (P2-20)
const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/common/db');
const bcrypt = require('bcryptjs');
const gov = require('../src/modules/governance/approvals');
const salesService = require('../src/modules/sales/service');
const financeService = require('../src/modules/finance/service');
const supplyService = require('../src/modules/supply/service');
const itService = require('../src/modules/it/service');
const qaService = require('../src/modules/qa/service');

const S = Date.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function ensureUser(username, role, employee_code) {
  let u = await db.get('SELECT * FROM users WHERE username=?', [username]);
  if (!u) {
    const h = await bcrypt.hash('User@123', 10);
    await db.run('INSERT INTO users(employee_code,username,password_hash,role) VALUES(?,?,?,?)',
      [employee_code, username, h, role]);
    u = await db.get('SELECT * FROM users WHERE username=?', [username]);
  }
  return u;
}

async function tokenOf(username, password = 'User@123') {
  const r = await request(app).post('/api/auth/login').send({ username, password });
  assert.equal(r.status, 200, 'login fail ' + username);
  return r.body.data.token;
}

async function ensureStock(sku, qty = 500) {
  const on = Number((await db.get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]))?.s || 0);
  if (on < qty) {
    try {
      await supplyService.moveStock(null, { sku, type: 'in', qty: qty - on, ref_code: 'P4-SEED', created_by: 'test' });
    } catch { /* trigger append-only co the chan */ }
  }
  return Number((await db.get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]))?.s || 0);
}

// ---------------------------------------------------------------------------
// p401: cap duyet LUON tinh tu approval-matrix.json — client khong ep cap duoc
// ---------------------------------------------------------------------------
test('p401: cap duyet tinh tu approval-matrix, client ep cap bi chan 400', async () => {
  const cust = await db.get("SELECT * FROM customers WHERE code='KH001'");
  const code = `P4E-${S}`;
  await db.run("INSERT INTO expenses(code,type,amount,paid,status,created_by) VALUES(?,'fee',60000000,0,'open',1)", [code]);
  const e = await db.get('SELECT * FROM expenses WHERE code=?', [code]);
  const admin = await db.get("SELECT * FROM users WHERE username='admin'");

  // 60tr => theo expense_po: manager (<50tr), cfo (<200tr) => 'cfo'
  const r = await gov.requestApproval(null, {
    ref_type: 'expense', ref_id: e.id, requester: admin.id, requester_username: admin.username,
  });
  assert.equal(r.level, 'cfo', '60tr phai cap cfo theo matrix');

  // Client ep cap thap hon => 400 (khong 500)
  await assert.rejects(
    () => gov.requestApproval(null, {
      ref_type: 'expense', ref_id: e.id, requester: admin.id, level: 'leader',
    }),
    (err) => err.status === 400 && /ep cap/.test(err.message)
  );

  // Client ep cap cao hon cung bi chan
  await assert.rejects(
    () => gov.requestApproval(null, {
      ref_type: 'expense', ref_id: e.id, requester: admin.id, level: 'ceo',
    }),
    (err) => err.status === 400
  );

  // Code KHONG hardcode nguong (chi doc tu matrix)
  const matrix = require('../docs/contract/approval-matrix.json');
  assert.ok(Array.isArray(matrix.amount_routing.expense_po), 'matrix co expense_po');
  assert.equal(gov.levelForAmount(60000000, 'expense_po'), 'cfo');
  assert.equal(gov.levelForAmount(1000000, 'expense_po'), 'leader');
  assert.equal(gov.levelForAmount(60000000, 'contract'), 'ceo', 'contract >= 50tr => ceo');
});

// ---------------------------------------------------------------------------
// p402: cap duyet BO SUNG (legal) — contract >= nguong can ca ceo + legal
// ---------------------------------------------------------------------------
test('p402: contract >= 50tr can ca ceo + legal moi signed', async () => {
  const cust = await db.get("SELECT * FROM customers WHERE code='KH001'");
  const code = `P4C-${S}`;
  await db.run("INSERT INTO contracts(code,customer_id,amount,status,created_by) VALUES(?,?,?,'pending_approval',1)", [code, cust.id, 60000000]);
  const ct = await db.get('SELECT * FROM contracts WHERE code=?', [code]);
  const admin = await db.get("SELECT * FROM users WHERE username='admin'");
  const mgr = await ensureUser('p4_mgr_' + S, 'manager', 'P4M' + S);
  const legal = await ensureUser('p4_legal_' + S, 'legal', 'P4L' + S);

  const a1 = await gov.requestApproval(null, { ref_type: 'contract', ref_id: ct.id, requester: mgr.id, requester_username: mgr.username });
  assert.equal(a1.level, 'ceo', 'cap chinh = ceo');
  // Cap bo sung legal theo matrix `contract_extra_legal`
  const extra = gov.extraLevelsFor('contract', Number(ct.amount), 'hop dong rui ro');
  assert.ok(extra.includes('legal'), 'matrix phai them legal');

  const a2 = await gov.requestApproval(null, {
    ref_type: 'contract', ref_id: ct.id, requester: mgr.id, requester_username: mgr.username, level: 'legal',
  });
  assert.equal(a2.level, 'legal', 'cap bo sung = legal');

  await gov.decideApproval(null, a1.id, { decider: admin.id, decision: 'approved' });
  const mid = await db.get('SELECT * FROM contracts WHERE id=?', [ct.id]);
  assert.notEqual(mid.status, 'signed', 'thieu legal chua duoc signed');
  assert.ok(!mid.signed_date, 'chua co signed_date');

  await gov.decideApproval(null, a2.id, { decider: legal.id, decision: 'approved' });
  const fin = await db.get('SELECT * FROM contracts WHERE id=?', [ct.id]);
  assert.equal(fin.status, 'signed');
  assert.ok(fin.signed_date, 'phai co signed_date');
});

// ---------------------------------------------------------------------------
// p403: ORDER_FLOW state machine — chuyen sai => 400
// ---------------------------------------------------------------------------
test('p403: ORDER_FLOW state machine chan chuyen trang thai sai', async () => {
  const OF = salesService.ORDER_FLOW;
  assert.equal(typeof OF, 'object', 'ORDER_FLOW phai la bang transition');
  assert.ok(Array.isArray(OF.draft));
  assert.ok(Array.isArray(OF.cancelled) && OF.cancelled.length === 0, 'cancelled la trang thai cuoi');

  // assertOrderTransition
  assert.doesNotThrow(() => salesService.assertOrderTransition('draft', 'pending'));
  assert.throws(() => salesService.assertOrderTransition('cancelled', 'paid'), /khong hop le/);
  assert.throws(() => salesService.assertOrderTransition('paid', 'done'), /khong hop le/);

  // cancel don da 'paid' => 400 (khong phai 500)
  const cust = await db.get("SELECT * FROM customers WHERE code='KH001'");
  const o = await salesService.createOrder(null, {
    code: `P4S-${S}`, customer_id: cust.id, items: [{ sku: 'CF-SUA-01', qty: 1 }], created_by: 'test',
  });
  const debt = await db.get('SELECT * FROM debts WHERE order_id=?', [o.id]);
  await financeService.recordPayment(null, {
    debt_id: debt.id, order_id: o.id, amount: Number(o.amount), method: 'cash', actor: 'test',
  });
  const paid = await db.get('SELECT * FROM orders WHERE id=?', [o.id]);
  assert.equal(paid.status, 'paid');
  await assert.rejects(
    () => salesService.cancelOrder(null, o.id, 'test'),
    (err) => err.status === 400
  );
});

// ---------------------------------------------------------------------------
// p404: setOrderPaid qua `partial` truoc `paid` (khong bo qua buoc giao hang)
// ---------------------------------------------------------------------------
test('p404: thanh toan day du khi don chua `done` van qua partial truoc paid', async () => {
  const cust = await db.get("SELECT * FROM customers WHERE code='KH001'");
  const o = await salesService.createOrder(null, {
    code: `P4P-${S}`, customer_id: cust.id, items: [{ sku: 'BANH-01', qty: 1 }], created_by: 'test',
  });
  // Don o trang thai 'pending' (chua qua approved/in_progress/done)
  const before = await db.get('SELECT * FROM orders WHERE id=?', [o.id]);
  assert.equal(before.status, 'pending');

  const debt = await db.get('SELECT * FROM debts WHERE order_id=?', [o.id]);
  await financeService.recordPayment(null, {
    debt_id: debt.id, order_id: o.id, amount: Number(o.amount), method: 'cash', actor: 'test',
  });
  const after = await db.get('SELECT * FROM orders WHERE id=?', [o.id]);
  assert.equal(after.status, 'paid', 'ket qua cuoi la paid');
  // Audit phai ghi ca 2 buoc (partial -> paid)
  const aud = await db.query(
    "SELECT * FROM audit_log WHERE table_name='orders' AND record_id=? AND action='update' ORDER BY id",
    [o.id]
  );
  const seen = aud.map((a) => JSON.parse(a.new_json || '{}').status);
  assert.ok(seen.includes('partial'), 'phai co buoc partial: ' + JSON.stringify(seen));
  assert.ok(seen.includes('paid'), 'phai co buoc paid');
});

// ---------------------------------------------------------------------------
// p405: storefront het hang => 409 + KHONG tao don ma (rollback toan bo)
// ---------------------------------------------------------------------------
test('p405: storefront het hang => 409 va khong tao don ma', async () => {
  // Don so luong <= 100 moi qua duoc validation (P2-20 test khac).
  // De "het hang", tao 1 SKU rieng voi ton = 0.
  const sku = 'P4-NO-STOCK-' + S;
  await db.run('INSERT INTO products(sku,name,price,cost) VALUES(?,?,?,?)', [sku, 'P4 het hang', 10000, 5000]);
  const before = await db.get("SELECT COUNT(*) c FROM orders WHERE source='storefront'");
  const r = await request(app).post('/api/public/orders').send({
    name: 'KH P4', phone: '0909994001', pay_method: 'cash',
    items: [{ sku, qty: 1 }],
  });
  assert.equal(r.status, 409, 'phai 409 STOCK_SHORTAGE, thay ' + r.status + ' ' + JSON.stringify(r.body));
  assert.equal(r.body.error.code, 'STOCK_SHORTAGE');
  const after = await db.get("SELECT COUNT(*) c FROM orders WHERE source='storefront'");
  assert.equal(Number(after.c), Number(before.c), 'khong duoc tao don khi het hang (rollback)');
});

// ---------------------------------------------------------------------------
// p406: IT_FLOW state machine + qa validate ref_id
// ---------------------------------------------------------------------------
test('p406: IT_FLOW state machine + qa validate ref_id ton tai', async () => {
  const IF = itService.IT_FLOW;
  assert.equal(typeof IF, 'object', 'IT_FLOW phai la bang transition');
  assert.ok(Array.isArray(IF.open));
  assert.throws(() => itService.assertIncidentTransition('closed', 'done'), /khong hop le/);
  assert.doesNotThrow(() => itService.assertIncidentTransition('open', 'fixing'));

  // Tao incident that
  const code = `INC-${S}`;
  const inc = await itService.create(null, { code, title: 'P4 incident', severity: 'p2', actor: 'test' });
  // open -> done => sai
  await assert.rejects(
    () => itService.setStatus(null, inc.id, { status: 'done' }, 'test'),
    (err) => err.status === 400
  );
  // open -> fixing => hop le
  const upd = await itService.setStatus(null, inc.id, { status: 'fixing' }, 'test');
  assert.equal(upd.status, 'fixing');

  // qa: ref_id khong ton tai => 404
  await assert.rejects(
    () => qaService.create(null, { ref_type: 'order', ref_id: 99999999, result: 'pass', checker: 'test' }),
    (err) => err.status === 404
  );
  // qa: ref_id ton tai => ok
  const o = await db.get("SELECT * FROM orders WHERE code LIKE 'DHT-%' LIMIT 1");
  if (o) {
    const q = await qaService.create(null, { ref_type: 'order', ref_id: o.id, result: 'pass', checker: 'test' });
    assert.ok(q.id);
  }
});

// ---------------------------------------------------------------------------
// p407: moi mutation co audit trong cung transaction (INV-2)
// ---------------------------------------------------------------------------
test('p407: writeAudit nem loi GOV khi chay ngoai transaction (INV-2)', async () => {
  const { writeAudit } = require('../src/common/audit');
  await assert.rejects(
    () => writeAudit(null, 'test', 'create', 'orders', 1, null, {}),
    (err) => err.status === 500 && /transaction/i.test(err.message)
  );
  await assert.rejects(
    () => writeAudit(undefined, 'test', 'create', 'orders', 1, null, {}),
    (err) => err.status === 500
  );

  // Mutation qua HTTP phai ghi audit trong cung tx (khong ton tai ban ghi khong audit).
  const token = await tokenOf('admin', 'Admin@123');
  const cust = await db.get("SELECT * FROM customers WHERE code='KH001'");
  const code = `P4A-${S}`;
  const r = await request(app).post('/api/orders').set('Authorization', 'Bearer ' + token).send({
    code, customer_id: cust.id, items: [{ sku: 'BANH-01', qty: 1 }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const aud = await db.get("SELECT * FROM audit_log WHERE table_name='orders' AND action='create' ORDER BY id DESC LIMIT 1");
  assert.ok(aud, 'phai co audit cho don vua tao');
  assert.ok(aud.new_json && aud.new_json.includes(code), 'audit phai chua ma don');
});

// ---------------------------------------------------------------------------
// p408: import-csv dem imported/skipped theo `changes` (P2-20)
// ---------------------------------------------------------------------------
test('p408: import-csv phan biet duplicate va invalid (P2-20)', async () => {
  const token = await tokenOf('ketoan');
  const csv = [
    'bank_ref,trans_date,amount,content',
    `P4DUP-${S},2026-11-04,100000,TT dup`,
    `P4DUP-${S},2026-11-04,100000,TT dup`,
    `P4INV-${S},2026-11-04,,thieu tien`,
    `P4OK-${S},2026-11-05,200000,TT ok`,
  ].join('\n');
  const r = await request(app).post('/api/transactions/import-csv')
    .set('Authorization', 'Bearer ' + token)
    .attach('file', Buffer.from(csv, 'utf8'), 'p4.csv');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.total, 4);
  assert.equal(r.body.data.imported, 2, '2 dong moi ghi duoc');
  assert.equal(r.body.data.duplicate, 1, '1 dong trung bank_ref');
  assert.equal(r.body.data.invalid, 1, '1 dong thieu tien');
  assert.equal(r.body.data.skipped, 2);
});
