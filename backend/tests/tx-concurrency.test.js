// tx-concurrency.test.js — TX-01 + DB-04 + P1-01
//   TX-01: SQLite transaction tren connection dung chung khong duoc de
//           request khac chen vao giua BEGIN/COMMIT (cross-request contamination).
//   DB-04: run() phai tra ID dung cua record vua ghi (khong fallback "last row").
//   P1-01: caller phai nhan dung ID cua record minh tao khi insert song song.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');

const db = require('../src/common/db');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DATABASE_PATH || '../data/bizops.db';

function makeProbeTable(prefix) {
  const table = prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const raw = new Database(DB_PATH);
  raw.exec(`CREATE TABLE IF NOT EXISTS ${table} (id INTEGER PRIMARY KEY AUTOINCREMENT, tag TEXT NOT NULL)`);
  raw.close();
  return table;
}
function dropProbeTable(table) {
  const raw = new Database(DB_PATH);
  raw.exec(`DROP TABLE IF EXISTS ${table}`);
  raw.close();
}

// --- TX-01: contamination test ---------------------------------------------
// A mo transaction roi "doi" (await) giua cac lenh.
// B la mot REQUEST RIENG (goi tu ngoai scope cua A) ghi doc lap trong khi A
// dang mo transaction.
// Neu khong serialize, B nam trong transaction cua A va bi A rollback xoa.
// Khi da serialize, B phai BI (block) cho den khi A ket thuc roi moi ghi —
// va du lieu cua B phai con nguyen.
test('tx01: rollback cua request A khong xoa du lieu ghi cua request B', async () => {
  const table = makeProbeTable('tx_probe_');

  let signalB = null;
  const bSignal = new Promise((res) => { signalB = res; });
  let bFinished = false;

  // A: transaction mo, cho B bat dau, roi rollback.
  const a = db.tx(async (c) => {
    await c.run(`INSERT INTO ${table}(tag) VALUES(?)`, ['A-inside']);
    // Danh dau "A dang mo transaction" va cho phep B chay (B chay o scope khac).
    signalB();
    await new Promise((r) => setTimeout(r, 60));
    throw new Error('A rollback intentionally');
  }).catch((e) => ({ err: e }));

  // B: request rieng — chay o ngoai scope cua A (khong inherit ALS store cua A).
  await bSignal;
  const b = db.run(`INSERT INTO ${table}(tag) VALUES(?)`, ['B-outside'])
    .then((r) => { bFinished = true; return r; });

  const aResult = await a;
  assert.ok(aResult.err, 'A phai throw de rollback');
  await b;
  assert.ok(bFinished, 'B phai chay xong');

  const rows = await db.all(`SELECT tag FROM ${table} WHERE tag=?`, ['B-outside']);
  assert.equal(rows.length, 1, 'Du lieu cua B phai con sau khi A rollback');
  const inside = await db.all(`SELECT tag FROM ${table} WHERE tag=?`, ['A-inside']);
  assert.equal(inside.length, 0, 'A rollback phai bo toan bo du lieu cua A');

  dropProbeTable(table);
});

// --- TX-01: serialize hanh vi ----------------------------------------------
test('tx01: cac transaction tren SQLite chay tuan tu (khong long nhau)', async () => {
  const table = makeProbeTable('tx_seq_');
  const order = [];
  const jobs = ['A', 'B', 'C'].map((tag) => db.tx(async (c) => {
    order.push(tag + '-in');
    await c.run(`INSERT INTO ${table}(tag) VALUES(?)`, [tag]);
    await new Promise((r) => setTimeout(r, 25));
    order.push(tag + '-out');
  }));

  await Promise.all(jobs);

  assert.equal(order.length, 6);
  for (let i = 0; i < 3; i++) {
    assert.equal(order[i * 2], ['A', 'B', 'C'][i] + '-in', 'Thu tu vao phai tuan tu');
    assert.equal(order[i * 2 + 1], ['A', 'B', 'C'][i] + '-out', 'Thu tu ra phai tuan tu');
  }

  dropProbeTable(table);
});

// --- DB-04 / P1-01: insert ID dung -----------------------------------------
test('db04: run() tra ID cua record vua ghi (khong phai record cuoi cung)', async () => {
  const table = makeProbeTable('tx_id_');

  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = await db.run(`INSERT INTO ${table}(tag) VALUES(?)`, ['tag-' + i]);
    assert.ok(r.lastInsertRowid, 'run() phai tra lastInsertRowid');
    ids.push(Number(r.lastInsertRowid));
  }
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'Moi lan insert phai tra ID khac nhau');
  for (let i = 1; i < ids.length; i++) {
    assert.ok(ids[i] > ids[i - 1], 'ID phai tang dan');
  }

  const last = await db.get(`SELECT tag FROM ${table} WHERE id=?`, [ids[ids.length - 1]]);
  assert.equal(last.tag, 'tag-4', 'ID phai tro dung ban ghi vua ghi');

  dropProbeTable(table);
});

// --- DB-04: insert song song, moi caller nhan dung ID ------------------------
test('db04: insert song song — moi caller nhan dung ID cua record minh tao', async () => {
  const table = makeProbeTable('tx_par_');

  const N = 20;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      db.run(`INSERT INTO ${table}(tag) VALUES(?)`, ['tag-' + i]).then((r) => ({ i, id: Number(r.lastInsertRowid) }))
    )
  );

  for (const { i, id } of results) {
    const row = await db.get(`SELECT tag FROM ${table} WHERE id=?`, [id]);
    assert.ok(row, 'ID ' + id + ' phai ton tai');
    assert.equal(row.tag, 'tag-' + i, 'Caller ' + i + ' nhan ID ' + id + ' cua ban ghi khac');
  }
  const all = await db.all(`SELECT id FROM ${table}`);
  assert.equal(all.length, N);

  dropProbeTable(table);
});