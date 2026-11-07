// dialect-regression.test.js — Regression cho cac loi da XAC NHAN tren CI.
//
// TAI SAO file nay ton tai: nhieu loi duoi day KHONG bi test cu bat loi
// "xanh gia" — SQLite im lang (khong rang buoc kieu) hoac bo qua (khong
// ton tai bang). Chi PostgreSQL moi lo ra. => can regression VIET LAI
// de bat loi quay lai tren BAT KY dialect.
//
// DANH SACH LOI DA XAC NHAN (mieu ta loi + fix):
//   PG-DB-01  RETURNING id tren bang khong co cot `id` (products/departments/
//             resource_dept/schema_migrations) -> PG: "column id does not exist".
//   PG-DB-04  Tham so CHUOI cho cot BIGINT (created_by/requester/checker/...):
//             SQLite ghi tam chuoi (du lieu sai, im lang), PG nem loi.
//   PG-DB-05  Test tao bang probe bang `better-sqlite3` truc tiep -> PG:
//             "relation does not exist".
//   PG-DB-06  `DROP TRIGGER IF EXISTS x` (thieu `ON <table>`) + `CREATE TRIGGER
//             IF NOT EXISTS ... BEGIN...END` la SQLite-only -> PG: 42601.
//   PG-DB-07  Truyen MA (chuoi) vao cot `id` BIGINT de so sanh "id OR code":
//             PG nem "invalid input syntax for type bigint".
//   PG-DB-08  `products` khoa chinh la `sku` (TEXT), KHONG co cot `id`.
//   PG-DB-09  `ON CONFLICT DO NOTHING` bo qua "RETURNING id" -> `insertedId()`
//             nem loi -> import-csv 500.
//   PG-TYPE-01 Driver `pg` tra BIGINT dang CHUOI -> cung mot cot co 2 kieu
//             giua 2 dialect -> `r1.id !== r2.id` (idempotency client sai).
//   TEST-ISO-01 Ton kho bi tieu het giua cac file test (cung DB) -> test
//             sau fail "Kho khong du ... (ton 0)".
const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');

const request = require('supertest');
const app = require('../src/server');
const db = require('../src/common/db');
const { withReturning, targetTable, normalizeParamsForSql, findByIdOrCode, asNumericId } = require('../src/common/db');

// ---------------------------------------------------------------------------
// PG-DB-01: khong them "RETURNING id" vao bang khong co cot `id`
// ---------------------------------------------------------------------------
test('pgr01: withReturning KHONG them RETURNING id cho bang khong co cot id', () => {
  for (const t of ['products', 'departments', 'resource_dept', 'schema_migrations']) {
    const sql = withReturning(`INSERT INTO ${t}(x) VALUES(?)`);
    assert.ok(!/\breturning\b/i.test(sql), `${t} khong co cot id -> phai KHONG co RETURNING id`);
  }
  // Bang co cot id -> VAN phai co RETURNING id (de insertedId() lay duoc).
  const sql = withReturning('INSERT INTO orders(code) VALUES(?)');
  assert.ok(/\breturning\s+id\b/i.test(sql), 'orders co cot id -> phai co RETURNING id');
});

test('pgr01: targetTable phai doc dung bang dich cho INSERT/UPDATE/DELETE', () => {
  assert.equal(targetTable('INSERT INTO products(sku) VALUES(?)'), 'products');
  assert.equal(targetTable('  update Orders SET x=? WHERE id=?'), 'orders');
  assert.equal(targetTable('DELETE FROM stock_moves WHERE id=?'), 'stock_moves');
  assert.equal(targetTable('SELECT * FROM orders'), null);
});

// ---------------------------------------------------------------------------
// PG-DB-04: chuan hoa tham so cho cot BIGINT "dinh danh nguoi"
// ---------------------------------------------------------------------------
test('pgr04: chuoi khong phai ID -> chuan hoa thanh null cho cot BIGINT', () => {
  // created_by la BIGINT: chuoi 'test' -> null (khong ghi chuoi vao cot so).
  const p1 = normalizeParamsForSql(
    'INSERT INTO contracts(code,customer_id,amount,status,created_by) VALUES(?,?,?,?,?)',
    ['C1', 1, 100, 'draft', 'test']
  );
  assert.equal(p1[4], null, 'created_by chuoi -> null');
  // Chuoi TOAN SO -> chuyen thanh so.
  const p2 = normalizeParamsForSql(
    'INSERT INTO contracts(code,customer_id,amount,status,created_by) VALUES(?,?,?,?,?)',
    ['C1', 1, 100, 'draft', '42']
  );
  assert.equal(p2[4], 42, 'created_by "42" -> 42');
  // So -> giu nguyen.
  const p3 = normalizeParamsForSql(
    'INSERT INTO contracts(code,customer_id,amount,status,created_by) VALUES(?,?,?,?,?)',
    ['C1', 1, 100, 'draft', 7]
  );
  assert.equal(p3[4], 7, 'created_by so -> giu nguyen');
  // Cot KHONG phai BIGINT -> KHONG doi (vi du gia tri tien, chuoi ngay).
  const p4 = normalizeParamsForSql(
    'INSERT INTO customers(code,name) VALUES(?,?)',
    ['KH1', 'test']
  );
  assert.equal(p4[1], 'test', 'cot TEXT khong bi chuan hoa');
});

test('pgr04: UPDATE cung chuan hoa theo cot', () => {
  const p = normalizeParamsForSql('UPDATE contracts SET status=?, created_by=? WHERE id=?', ['signed', 'test', 5]);
  assert.equal(p[1], null, 'created_by chuoi -> null');
});

// ---------------------------------------------------------------------------
// PG-DB-09: ON CONFLICT DO NOTHING VAN phai co RETURNING id
// ---------------------------------------------------------------------------
test('pgr09: ON CONFLICT DO NOTHING van them RETURNING id (PG ho tro)', () => {
  const sql = withReturning("INSERT INTO transactions(trans_date,amount,content,bank_ref,status) VALUES(?,?,?,?,'unmatched') ON CONFLICT(bank_ref) DO NOTHING");
  assert.ok(/\breturning\s+id\b/i.test(sql),
    'PG HO TRO "ON CONFLICT DO NOTHING RETURNING id" (0 dong khi conflict) -> phai them');
});

// ---------------------------------------------------------------------------
// PG-DB-07: tra cuu "id HOAC code" khong bind chuoi vao cot BIGINT
// ---------------------------------------------------------------------------
test('pgr07: asNumericId chi nhan so nguyen duong', () => {
  assert.equal(asNumericId('42'), 42);
  assert.equal(asNumericId(42), 42);
  assert.equal(asNumericId('DV-TEABREAK'), null);
  assert.equal(asNumericId('0'), null);
  assert.equal(asNumericId('-1'), null);
  assert.equal(asNumericId(null), null);
  assert.equal(asNumericId(''), null);
});

test('pgr07: findByIdOrCode tra duoc theo MA (chuoi) va theo ID (so)', async () => {
  const svc = await db.get('SELECT id, code FROM services WHERE code=?', ['DV-TEABREAK']);
  assert.ok(svc, 'dich vu DV-TEABREAK phai ton tai (seed storefront)');
  // Tra cuu theo MA (chuoi) — KHONG nem loi bigint tren PG.
  const byCode = await findByIdOrCode(db, 'services', 'DV-TEABREAK', { cols: 'id, code' });
  assert.ok(byCode, 'tra cuu theo code phai tra duoc ban ghi');
  assert.equal(byCode.code, 'DV-TEABREAK');
  // Tra cuu theo ID (so).
  const byId = await findByIdOrCode(db, 'services', svc.id, { cols: 'id, code' });
  assert.ok(byId, 'tra cuu theo id phai tra duoc ban ghi');
  assert.equal(byId.id, svc.id);
  // Chuoi khong ton tai -> null (khong throw).
  const miss = await findByIdOrCode(db, 'services', 'DV-KHONG-CO', { cols: 'id, code' });
  assert.equal(miss, null);
});

// ---------------------------------------------------------------------------
// PG-TYPE-01: BIGINT phai tra Number tren CA 2 dialect
// ---------------------------------------------------------------------------
test('pgr10: cot BIGINT tra ve NUMBER (dong nhat SQLite <-> PostgreSQL)', async () => {
  const row = await db.get('SELECT id, code FROM customers WHERE code=?', ['KH001']);
  assert.ok(row, 'KH001 phai ton tai (seed demo)');
  assert.equal(typeof row.id, 'number', `customers.id phai la number, nhan ${typeof row.id} (${row.id})`);
  const t = await db.get('SELECT id, amount FROM transactions ORDER BY id DESC LIMIT 1');
  if (t) {
    assert.equal(typeof t.id, 'number', `transactions.id phai la number, nhan ${typeof t.id}`);
    assert.equal(typeof t.amount, 'number', `transactions.amount phai la number, nhan ${typeof t.amount}`);
  }
  const o = await db.get('SELECT id, amount FROM orders ORDER BY id DESC LIMIT 1');
  if (o) {
    assert.equal(typeof o.id, 'number', `orders.id phai la number, nhan ${typeof o.id}`);
    assert.equal(typeof o.amount, 'number', `orders.amount phai la number, nhan ${typeof o.amount}`);
  }
});

// Idempotency: cung 1 `id` phai tra cung KIUU tren ca 2 nhanh (insert moi va dedup).
test('pgr10: idempotent payment tra cung ID va cung KIEU du mot lan goi lai', async () => {
  const financeService = require('../src/modules/finance/service');
  const salesService = require('../src/modules/sales/service');
  const { ensureStockAll } = require('./helpers/stock');
  await ensureStockAll(['CF-SUA-01'], 500);
  const cust = await db.get("SELECT * FROM customers WHERE code='KH001'");
  const S = Date.now();
  const o = await salesService.createOrder(null, {
    code: `PGR10-${S}`, customer_id: cust.id, items: [{ sku: 'CF-SUA-01', qty: 1 }], created_by: 'test',
  });
  const debt = await db.get('SELECT * FROM debts WHERE order_id=?', [o.id]);
  const key = `pgr10-${S}`;
  const r1 = await financeService.recordPayment(null, { debt_id: debt.id, order_id: o.id, amount: 1000, method: 'cash', actor: 'test', idempotency_key: key });
  const r2 = await financeService.recordPayment(null, { debt_id: debt.id, order_id: o.id, amount: 1000, method: 'cash', actor: 'test', idempotency_key: key });
  assert.equal(r2.deduped, true, 'lan goi lai phai deduped');
  assert.equal(r2.id, r1.id, 'ID phai giong nhau');
  assert.equal(typeof r2.id, typeof r1.id, 'KIUU ID phai giong nhau giua lan moi va lan retry');
  assert.equal(typeof r2.id, 'number', 'ID phai la number tren ca 2 dialect');
});

// ---------------------------------------------------------------------------
// PG-DB-08: qa/service.js — products khoa chinh la `sku`, khong phai `id`
// ---------------------------------------------------------------------------
test('pgr08: qa_checks voi ref_type=product kiem tra ton tai theo SKU', async () => {
  const qaService = require('../src/modules/qa/service');
  const prod = await db.get('SELECT sku FROM products WHERE sku=?', ['CF-SUA-01']);
  assert.ok(prod, 'san pham CF-SUA-01 phai ton tai');
  // `products` co cot `sku` (TEXT) va KHONG co cot `id`.
  const cols = await db.all('SELECT * FROM products LIMIT 1');
  assert.ok(!('id' in cols[0]), 'bang products KHONG co cot id (khoa chinh la sku)');
  // `qa_checks.ref_id` phai la TEXT (chua ca SO va MA) — migration 007.
  const qc = await db.all('SELECT * FROM qa_checks LIMIT 1');
  if (qc.length) assert.equal(typeof qc[0].ref_id, 'string', 'qa_checks.ref_id phai la TEXT');
  // Tao QA check tham chieu san pham (theo SKU) -> phai thanh cong.
  const r = await qaService.create(null, { ref_type: 'product', ref_id: 'CF-SUA-01', result: 'pass', checker: 'test' });
  assert.ok(r.id, 'QA check theo SKU phai tao duoc');
  // San pham khong ton tai -> phai 404.
  await assert.rejects(
    () => qaService.create(null, { ref_type: 'product', ref_id: 'SKU-KHONG-CO', result: 'pass', checker: 'test' }),
    (e) => e.status === 404
  );
  // ref_type=order voi ref_id la CHUOI -> phai 404 (khong nem loi bigint tren PG).
  await assert.rejects(
    () => qaService.create(null, { ref_type: 'order', ref_id: 'KHONG-PHAI-SO', result: 'pass', checker: 'test' }),
    (e) => e.status === 404
  );
});

// ---------------------------------------------------------------------------
// PG-DB-06: trigger append-only phai tao/xoa duoc tren CA 2 dialect
// ---------------------------------------------------------------------------
// BUG (TEST-ISO-02): trigger append-only la TRANG THAI CUA DB (khong phai cua
// file test). File test khac (reconcile, public-write) co the da drop trigger
// de don data => file nay phai KHOI PHUC truoc khi kiem tra (khong thi CHECK
// append-only bi bo qua).
// ---------------------------------------------------------------------------
test.before(async () => {
  const { ensureAppendOnlyTrigger } = require('./helpers/triggers');
  await ensureAppendOnlyTrigger('payments');
  await ensureAppendOnlyTrigger('stock_moves');
  await ensureAppendOnlyTrigger('audit_log');
});

// ---------------------------------------------------------------------------
test('pgr06: tao/xoa trigger append-only duoc tren ca 2 dialect', async () => {
  const { createAppendOnlyTrigger, dropAppendOnlyTrigger } = require('./helpers/triggers');
  // Tao 1 payment RIENG cho test (KHONG dung data seed — mutation du lieu seed
  // se lam hong invariant I1 "debts.paid = SUM(payments)" cho cac test sau).
  const admin = await db.get("SELECT id FROM users WHERE username='admin'");
  const exp = await db.run(
    "INSERT INTO expenses(code,type,amount,paid,status,created_by) VALUES(?,'fee',100000,0,'open',?)",
    [`PGR06-${Date.now()}`, admin ? admin.id : null]
  );
  const expId = exp.lastInsertRowid;
  const pay = await db.run(
    "INSERT INTO payments(expense_id,amount,method,actor,note) VALUES(?,7,'cash','pgr06','PGR06')",
    [expId]
  );
  const pid = pay.lastInsertRowid;
  assert.ok(pid, 'phai tao duoc 1 payment rieng cho test');

  // (1) Trigger append-only PHAI ton tai (migration tao san) => UPDATE bi chan.
  await assert.rejects(
    () => db.run('UPDATE payments SET amount=8 WHERE id=?', [pid]),
    (e) => /append-only/i.test(String(e.message || '')),
    'trigger append-only (migration) phai chan UPDATE'
  );

  // (2) Drop trigger (dialect-aware) => UPDATE duoc phep.
  await dropAppendOnlyTrigger('payments');
  await db.run('UPDATE payments SET amount=8 WHERE id=?', [pid]);

  // (3) Tao lai trigger (dialect-aware) => UPDATE bi chan AGAIN.
  //     Day la buoc that su lo loi PG-DB-06 (SQLite-only `CREATE TRIGGER IF
  //     NOT EXISTS ... BEGIN ... END` => PG 42601).
  await createAppendOnlyTrigger('payments');
  await assert.rejects(
    () => db.run('UPDATE payments SET amount=9 WHERE id=?', [pid]),
    (e) => /append-only/i.test(String(e.message || '')),
    'trigger tao lai phai chan UPDATE tren ca 2 dialect'
  );

  // Don du lieu test (khong phai data seed) + khoi phuc expense.
  await db.run('UPDATE expenses SET paid=0 WHERE id=?', [expId]).catch(() => {});
});

// ---------------------------------------------------------------------------
// TEST-ISO-01: ton kho phai du cho cac test sau (khong phu thuoc thu tu file)
// ---------------------------------------------------------------------------
test('pgr12: helper ensureStock lam ton kho du o moi thoi diem', async () => {
  const { ensureStock, stockOf } = require('./helpers/stock');
  const sku = `PGR12-${Date.now().toString(36)}`;
  await db.run('INSERT INTO products(sku,name,price,cost) VALUES(?,?,?,?)', [sku, 'PGR12', 1000, 500]);
  await ensureStock(sku, 42);
  assert.ok(await stockOf(sku) >= 42, 'ton kho phai >= 42 sau ensureStock');
  // Dam bao idempotent: goi lai khong lam tang ton kho vo han.
  const before = await stockOf(sku);
  await ensureStock(sku, 42);
  assert.equal(await stockOf(sku), before, 'ensureStock phai idempotent');
});

// ---------------------------------------------------------------------------
// PG-DB-05: probe table phai dung DIALECT cua DB dang test
// ---------------------------------------------------------------------------
test('pgr05: probe table duoc tao qua adapter (dung dialect DB dang test)', async () => {
  const table = 'pgr05_probe_' + Date.now().toString(36);
  await db.run(`CREATE TABLE IF NOT EXISTS ${table} (id ${db.DIALECT === 'pg' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT'}, tag TEXT NOT NULL)`);
  const r = await db.run(`INSERT INTO ${table}(tag) VALUES(?)`, ['x']);
  assert.ok(r.lastInsertRowid, 'insert vao probe table phai tra ID');
  const row = await db.get(`SELECT tag FROM ${table} WHERE id=?`, [r.lastInsertRowid]);
  assert.equal(row.tag, 'x');
  await db.run(`DROP TABLE IF EXISTS ${table}`);
});

// ---------------------------------------------------------------------------
// Kiem tra endpoint public khong nem loi 500 khi tra cuu dich vu theo MA
// ---------------------------------------------------------------------------
test('pgr07b: GET /api/public/services/:ma tra 200 (khong 500 bigint)', async () => {
  const r = await request(app).get('/api/public/services/DV-TEABREAK');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.code, 'DV-TEABREAK');
});

test('pgr07b: POST /api/public/service-requests theo MA khong nem loi 500', async () => {
  const phone = '0908' + String(Date.now()).slice(-6);
  const r = await request(app).post('/api/public/service-requests').send({
    service_id: 'DV-TEABREAK', name: 'PGR KH', phone, party_size: 4, location: 'HCM',
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.service, 'DV-TEABREAK');
});
