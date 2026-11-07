const Database = require('better-sqlite3');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

const DIALECT = process.env.PG_HOST ? 'pg' : 'sqlite';
const SQLITE_PATH = process.env.DATABASE_PATH || './data/bizops.db';

// TX-04: nhan dien loi UNIQUE constraint (idempotency key trung) de
// service co the tra ve ban ghi da ton tai thay vi loi 500.
function isUniqueViolation(err) {
  if (!err) return false;
  const code = err.code || '';
  if (code === '23505' || code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') return true;
  const msg = String(err.message || '');
  return /unique constraint|duplicate key|UNIQUE constraint failed/i.test(msg);
}
let sqliteDb = null;
let pgPool = null;

// ---------------------------------------------------------------------------
// INV-5 / Phase 0.5: mot nguon thoi gian duy nhat theo Asia/Ho_Chi_Minh.
//
// BUG CU: tzVN() dung `new Date(d.toLocaleString('en-US', {timeZone:'Asia/Ho_Chi_Minh'}))`
// -> bien doi thanh Date theo gio dia phuong (UTC+7) roi .toISOString() lai dua ve
// UTC. Voi moc 00:30 VN ngay 2 (17:30Z ngay 1) -> ra "2026-01-01" => LECH 1 NGAY.
// Voi moc 07:00 VN ngay 7 (00:00Z) -> "2026-11-06" => LECH 1 NGAY.
//
// FIX: dung Intl.DateTimeFormat voi timeZone de trich truc tiep cac thanh phan
// Y/M/D/H/M/S theo gio VN, KHONG di qua Date/UTC cho phan "ngay".
// ---------------------------------------------------------------------------
function tzParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t).value;
  return { y: g('year'), m: g('month'), d: g('day'), hh: g('hour'), mm: g('minute'), ss: g('second') };
}

/** Ngay nghiem vu theo gio VN: 'YYYY-MM-DD'. */
function todayVN() {
  const t = tzParts();
  return `${t.y}-${t.m}-${t.d}`;
}

/** Date "moc" tai thoi diem hien tai theo gio VN (dung de so sanh/co so). */
function nowVN() {
  const t = tzParts();
  return new Date(Number(t.y), Number(t.m) - 1, Number(t.d), Number(t.hh), Number(t.mm), Number(t.ss));
}

/** Ngay nghiem vu +/− N ngay, theo gio VN (khong qua UTC de tranh lech ngay). */
function businessDayVN(offsetDays = 0) {
  const t = tzParts();
  const dt = new Date(Date.UTC(Number(t.y), Number(t.m) - 1, Number(t.d)) + offsetDays * 86400000);
  return dt.toISOString().slice(0, 10);
}
function sinceVN(days = 30) { return businessDayVN(-Math.abs(days)); }

/** Timestamp chuan cho DB: 'YYYY-MM-DD HH:mm:ss' (gio VN). */
function nowISO() {
  const t = tzParts();
  return `${t.y}-${t.m}-${t.d} ${t.hh}:${t.mm}:${t.ss}`;
}

/** Chuoi timestamp chuan cho mot Date bat ky (mac dinh = hien tai), gio VN. */
function toSqlDateTime(d = new Date()) {
  const t = tzParts(d);
  return `${t.y}-${t.m}-${t.d} ${t.hh}:${t.mm}:${t.ss}`;
}

/** Timestamp SQL tuyet doi (khong theo gio VN) — dung cho khoa/thoi han. */
function toUtcDateTime(d = new Date()) {
  return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
}
function nowPlusMinutesISO(min = 15) {
  return toUtcDateTime(new Date(Date.now() + min * 60000));
}
/** So sanh chuoi timestamp theo cung dinh dang (ISO-lexicographic). */
function isExpired(value, now = nowISO()) {
  return String(value || '').replace('T', ' ').slice(0, 19) < now;
}

// ---------------------------------------------------------------------------
// TX-01: an toan transaction tren connection SQLite dung chung.
//
// SQLite chi co MOT connection. Neu mot request giu BEGIN roi await (I/O,
// bcrypt, sleep), request khac goi run()/query() se cham vao CUNG connection
// dang trong transaction -> du lieu cua request khac bi commit/rollback nham.
//
// Fix: MOT khoa (mutex) bao toan moi thao tac tren connection:
//   - transaction giu khoa TRONG SUOT ban giao dich
//   - lenh doc/ghi ngoai transaction cho doi cho khoa
//   - trong transaction, lenh module-level dung thang connection (re-entrant)
//     qua AsyncLocalStorage de khong deadlock.
// ---------------------------------------------------------------------------
const sqliteLock = new AsyncLocalStorage();
let sqliteQueue = Promise.resolve();

/** Chay thao tac doc/ghi ngoai transaction (co khoa). */
async function withSqlite(fn) {
  // Dang o trong 1 transaction -> dung thang, khong cho doi (re-entrant).
  if (sqliteLock.getStore()) return fn(sqliteLock.getStore().db);
  let release;
  const next = new Promise((res) => { release = res; });
  const prev = sqliteQueue;
  sqliteQueue = prev.then(() => next);
  await prev.catch(() => {});
  try {
    return await fn(getSqlite());
  } finally {
    release();
  }
}

function getSqlite() {
  if (!sqliteDb) {
    fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
    sqliteDb = new Database(SQLITE_PATH, { timeout: 10000 });
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('busy_timeout = 10000');
    sqliteDb.pragma('foreign_keys = ON');
  }
  return sqliteDb;
}
// DB-01 + OPS-02 FIX v7: mot nguon thoi gian duy nhat — tinh o app (JS), truyen param vao SQL.
// Khong dung datetime('now')/date('now')/strftime trong src (lint trong verify.js).
function getPool() {
  if (!pgPool) {
    pgPool = new Pool({
      host: process.env.PG_HOST, port: process.env.PG_PORT || 5432,
      user: process.env.PG_USER, password: process.env.PG_PASSWORD,
      database: process.env.PG_DB,
    });
  }
  return pgPool;
}

// normalize tieng Viet: NFD + map d/D (mau chuan v6.1)
function norm(s = '') {
  return String(s).toLowerCase().normalize('NFD')
    .replace(/[đ]/g, 'd').replace(/[Đ]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// DB-03: chuan hoa tham so Boolean theo dialect.
//   - PostgreSQL: boolean -> boolean (binding native).
//   - SQLite: cot BOOLEAN la INTEGER, va better-sqlite3 KHONG bind duoc
//     JS boolean (se throw "can not bind boolean"). Phai doi thanh 1/0.
function normParams(params) {
  if (DIALECT === 'pg') return params;
  return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

async function query(sql, params = []) {
  if (DIALECT === 'pg') {
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => '$' + (++i));
    const r = await getPool().query(pgSql, params);
    return r.rows;
  }
  return withSqlite((db) => db.prepare(sql).all(...normParams(params)));
}
async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
async function all(sql, params = []) { return query(sql, params); }

// DB-04: chuan hoa tra ID cho moi dialect.
//   - PostgreSQL: them "RETURNING id" vao INSERT/UPDATE/DELETE khi chua co,
//     nen run() luon tra lastInsertRowid = id cua record vua ghi.
//   - SQLite: lastInsertRowid cua better-sqlite3 da la id vua insert.
// ID truoc day tren PG chi co khi cau lenh co RETURNING; cau lenh INSERT
// thuong thi undefined => caller fallback "ORDER BY id DESC LIMIT 1" va lay
// NHAM id cua request khac (race condition tao du lieu sai).
function withReturning(sql) {
  const s = String(sql).trim();
  if (/\breturning\b/i.test(s)) return s;
  if (!/^\s*(insert|update|delete)\b/i.test(s)) return s;
  // INSERT ... ON CONFLICT DO NOTHING: khong co RETURNING (PG loi) -> bo qua.
  if (/\bon\s+conflict\b[\s\S]*\bdo\s+nothing\b/i.test(s)) return s;
  return s.replace(/\s*$/, '') + ' RETURNING id';
}

// TX-02/TX-03: them "FOR UPDATE" vao SELECT de khoa dong hang trong transaction.
//   - PostgreSQL: co that su row-level lock -> chong oversell / overpayment.
//   - SQLite: khong ho tro -> adapter bo qua (tx da serialize o TX-01).
function withForUpdate(sql) {
  const s = String(sql).trim();
  if (DIALECT !== 'pg') return s;
  if (/\bfor\s+update\b/i.test(s)) return s;
  if (!/^\s*select\b/i.test(s)) return s;
  return s.replace(/\s*$/, '') + ' FOR UPDATE';
}

async function run(sql, params = []) {
  if (DIALECT === 'pg') {
    let i = 0;
    const pgSql = withReturning(sql).replace(/\?/g, () => '$' + (++i));
    const r = await getPool().query(pgSql, params);
    return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
  }
  return withSqlite((db) => {
    const r = db.prepare(sql).run(...normParams(params));
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  });
}
async function tx(fn) {
  if (DIALECT === 'pg') {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const conn = {
        query: (s, p = []) => { let i = 0; return client.query(s.replace(/\?/g, () => '$' + (++i)), p).then(r => r.rows); },
        get: async (s, p = []) => (await conn.query(s, p))[0] || null,
        run: async (s, p = []) => {
          let i = 0;
          const r = await client.query(withReturning(s).replace(/\?/g, () => '$' + (++i)), p);
          return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
        },
        // TX-02/TX-03: khoa dong hang (SELECT ... FOR UPDATE) de chong race.
        // Tren SQLite khong co row-level lock -> phai serialize toan bo tx
        // (da lam o TX-01), nen cung an toan.
        lock: async (s, p = []) => {
          let i = 0;
          const sql = withForUpdate(s).replace(/\?/g, () => '$' + (++i));
          const r = await client.query(sql, p);
          return r.rows[0] || null;
        },
      };
      const out = await fn(conn);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* rollback fail -> connection die */ }
      throw e;
    }
    finally { client.release(); }
  }
  // TX-01: giu khoa toan bo giao dich; moi thao tac khac cho doi.
  let release;
  const next = new Promise((res) => { release = res; });
  const prev = sqliteQueue;
  sqliteQueue = prev.then(() => next);
  await prev.catch(() => {});
  const db = getSqlite();
  try {
    return await sqliteLock.run({ db }, async () => {
      // BEGIN IMMEDIATE (khong phai BEGIN deferred): SQLite deferred transaction
      // bat dau bang lenh SELECT -> transaction o trang thai READ; khi den
      // lenh ghi dau tien, SQLite phai "nang cap" (upgrade) sang WRITE. Neu
      // connection khac cung dang doc, SQLite tra SQLITE_BUSY ngay (khong
      // chay busy_timeout) -> loi "database is locked".
      // BEGIN IMMEDIATE lay khoa ghi NGAY khi bat dau -> khong bao gio
      // gap SQLITE_BUSY, va van serialize duoi khoa TX-01.
      db.exec('BEGIN IMMEDIATE');
      const conn = {
        query: (s, p = []) => Promise.resolve(db.prepare(s).all(...normParams(p))),
        get: (s, p = []) => Promise.resolve(db.prepare(s).get(...normParams(p)) || null),
        run: (s, p = []) => { const r = db.prepare(s).run(...normParams(p)); return Promise.resolve({ changes: r.changes, lastInsertRowid: r.lastInsertRowid }); },
        // TX-02/TX-03: SQLite khong co FOR UPDATE. Transaction da duoc serialize
        // (TX-01) nen doc-then-ghi trong cung transaction la an toan.
        lock: async (s, p = []) => Promise.resolve(db.prepare(s).get(...normParams(p)) || null),
      };
      try {
        const out = await fn(conn);
        db.exec('COMMIT');
        return out;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* rollback fail -> bang da dong */ }
        throw e;
      }
    });
  } finally {
    release();
  }
}

// Exports: dat o CUOI file de moi function deu da khai bao (INV-6: mot nguon).
module.exports = {
  query, get, all, run, tx, norm,
  nowVN, todayVN, businessDayVN, sinceVN, nowPlusMinutesISO, nowISO,
  toSqlDateTime, toUtcDateTime, isExpired,
  DIALECT, isUniqueViolation,
};