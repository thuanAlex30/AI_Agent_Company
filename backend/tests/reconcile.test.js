const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const path = require('path');
const fs = require('fs');
const request = require('supertest');
const app = require('../src/server');
const { get, run, query } = require('../src/common/db');
const financeService = require('../src/modules/finance/service');

// 8 khoan doi soat + DHR09 (cung tien khac ma, khong co giao dich) + cap DHR10A/B (hoa diem -> review)
const SPECS = [
  { o: 'DHR01', c: 'KHR01', amt: 500000 },
  { o: 'DHR02', c: 'KHR02', amt: 750000 },
  { o: null, c: 'KHR03', amt: 1000000 }, // KH-only: 40+40 pass
  { o: 'DHR04', c: 'KHR04', amt: 300000 },
  { o: 'DHR05', c: 'KHR05', amt: 450000 },
  { o: 'DHR06', c: 'KHR06', amt: 600000 },
  { o: 'DHR07', c: 'KHR07', amt: 200000 }, // noi dung co dau (Thanh toán) -> đ→d
  { o: 'DHR08', c: 'KHR08', amt: 900000 },
  { o: 'DHR09', c: 'KHR09', amt: 500000 }, // cung remain 500k nhung khac ma -> khong khop nham
  { o: 'DHR10A', c: 'KHR10', amt: 111000 }, // cap hoa diem -> unmatched
  { o: 'DHR10B', c: 'KHR10', amt: 111000 },
];

async function cleanup() {
  // Bang append-only (payments/stock_moves) chan DELETE -> ha trigger tam de don test
  await run('DROP TRIGGER IF EXISTS trg_no_delete_payments');
  await run('DROP TRIGGER IF EXISTS trg_no_update_payments');
  await run('DROP TRIGGER IF EXISTS trg_no_delete_stock');
  await run('DROP TRIGGER IF EXISTS trg_no_update_stock');
  await run("DELETE FROM payments WHERE note LIKE '%RC0%' OR note LIKE '%recon%' OR note LIKE '%RECTEST%' OR order_id IN (SELECT id FROM orders WHERE code LIKE 'DHR%')");
  await run("DELETE FROM reminder_log WHERE debt_id IN (SELECT id FROM debts WHERE note LIKE 'RECTEST%' OR order_id IN (SELECT id FROM orders WHERE code LIKE 'DHR%'))");
  await run("DELETE FROM transactions WHERE bank_ref LIKE 'RC%'");
  await run("DELETE FROM debts WHERE note LIKE 'RECTEST%' OR order_id IN (SELECT id FROM orders WHERE code LIKE 'DHR%')");
  await run('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE code LIKE \'DHR%\')');
  await run('DELETE FROM shipments WHERE order_id IN (SELECT id FROM orders WHERE code LIKE \'DHR%\')');
  await run("DELETE FROM stock_moves WHERE ref_code LIKE 'DHR%'");
  await run("DELETE FROM orders WHERE code LIKE 'DHR%'");
  await run("DELETE FROM customers WHERE code LIKE 'KHR%'");
  // dung lai trigger append-only
  await run("CREATE TRIGGER IF NOT EXISTS trg_no_update_payments BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT,'payments append-only'); END");
  await run("CREATE TRIGGER IF NOT EXISTS trg_no_delete_payments BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT,'payments append-only'); END");
  await run("CREATE TRIGGER IF NOT EXISTS trg_no_update_stock BEFORE UPDATE ON stock_moves BEGIN SELECT RAISE(ABORT,'stock_moves append-only'); END");
  await run("CREATE TRIGGER IF NOT EXISTS trg_no_delete_stock BEFORE DELETE ON stock_moves BEGIN SELECT RAISE(ABORT,'stock_moves append-only'); END");
}

async function setupDebts() {
  let i = 0;
  for (const s of SPECS) {
    i++;
    let cust = await get('SELECT * FROM customers WHERE code=?', [s.c]);
    if (!cust) {
      await run('INSERT INTO customers(code,name,phone,type) VALUES(?,?,?,?)', [s.c, 'KH ' + s.c, '09' + String(10000000 + i), 'retail']);
      cust = await get('SELECT * FROM customers WHERE code=?', [s.c]);
    }
    let orderId = null;
    if (s.o) {
      await run("INSERT INTO orders(code,customer_id,amount,status,order_date) VALUES(?, ?,?,'pending',date('now'))", [s.o, cust.id, s.amt]);
      orderId = (await get('SELECT id FROM orders WHERE code=?', [s.o])).id;
    }
    await financeService.createReceivable(null, { customer_id: cust.id, order_id: orderId, amount: s.amt, created_by: 'test', note: `RECTEST ${s.o || s.c}` });
  }
  await run("INSERT INTO transactions(trans_date,amount,content,bank_ref,status) VALUES(date('now'),111000,'Chuyen tien KHR10','RC010','unmatched') ON CONFLICT(bank_ref) DO NOTHING");
}

async function tokenKetToan() {
  const login = await request(app).post('/api/auth/login').send({ username: 'ketoan', password: 'User@123' });
  assert.equal(login.body.ok, true);
  return login.body.data.token;
}

test('recon1: import CSV 10 dong -> imported 9 / skipped 1', async () => {
  await cleanup();
  const token = await tokenKetToan();
  const res = await request(app).post('/api/transactions/import-csv')
    .set('Authorization', 'Bearer ' + token)
    .attach('file', path.join(__dirname, 'fixtures/statement.csv'));
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.total, 10);
  assert.equal(res.body.data.imported, 9);
  assert.equal(res.body.data.skipped, 1);
});

test('recon2: reconcile -> matched 8/9 (partial DH001 theo remain)', async () => {
  await setupDebts();
  const token = await tokenKetToan();
  const res = await request(app).post('/api/reconcile/run').set('Authorization', 'Bearer ' + token);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.matched, 8);
  assert.equal(res.body.data.total, 9);
});

test('recon3: partial khop remain; KH-only pass; cung tien khac ma khong nham; hoa diem review; đ→d', async () => {
  const d1 = await get("SELECT * FROM debts WHERE note='RECTEST DHR01'");
  assert.equal(Number(d1.paid), 500000);
  assert.equal(d1.status, 'done');
  const o1 = await get("SELECT * FROM orders WHERE code='DHR01'");
  assert.equal(o1.status, 'paid');
  const d3 = await get("SELECT * FROM debts WHERE note='RECTEST KHR03'");
  assert.equal(Number(d3.paid), 1000000, 'KH-only (40+40) phai pass');
  const d9 = await get("SELECT * FROM debts WHERE note='RECTEST DHR09'");
  assert.equal(Number(d9.paid), 0, 'cung tien khac ma khong duoc khop nham');
  const t10 = await get("SELECT * FROM transactions WHERE bank_ref='RC010'");
  assert.equal(t10.status, 'unmatched', 'hoa diem max phai review (unmatched)');
  const d7 = await get("SELECT * FROM debts WHERE note='RECTEST DHR07'");
  assert.equal(Number(d7.paid), 200000, 'noi dung co dau phai khop (đ→d)');
});

test('recon4: invariants.sql 0 dong vi pham', async () => {
  const raw = fs.readFileSync('docs/contract/invariants.sql', 'utf8');
  const sql = raw.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const stmts = sql.match(/SELECT[\s\S]*?;/gi) || [];
  assert.ok(stmts.length >= 8, 'invariants phai co >=8 query, thay ' + stmts.length);
  for (const st of stmts) {
    const rows = await query(st);
    assert.equal(rows.length, 0, 'Vi pham invariant: ' + JSON.stringify(rows[0]));
  }
});
