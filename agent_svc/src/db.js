const Database = require('better-sqlite3');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

const DIALECT = process.env.PG_HOST ? 'pg' : 'sqlite';
const SQLITE_PATH = process.env.DATABASE_PATH || './data/bizops.db';
let sqliteDb = null;
let pgPool = null;

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

/** Date "moc" tai thoi diem hien tai theo gio VN. */
function nowVN() {
  const t = tzParts();
  return new Date(Number(t.y), Number(t.m) - 1, Number(t.d), Number(t.hh), Number(t.mm), Number(t.ss));
}

// TX-01: an toan transaction tren connection SQLite dung chung.
// Transaction giu khoa toan bo giao dich; lenh doc/ghi ngoai transaction cho
// doi cho khoa; lenh trong transaction dung thang connection (re-entrant).
const sqliteLock = new AsyncLocalStorage();
let sqliteQueue = Promise.resolve();

async function withSqlite(fn) {
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
function getPool() {
  if (!pgPool) {
    pgPool = new Pool({
      host: process.env.PG_HOST, port: process.env.PG_PORT || 5432,
      user: process.env.PG_USER, password: process.env.PG_PASSWORD,
      database: process.env.PG_DB,
      // PARITY backend (PG-TYPE-01): pg tra BIGINT/NUMERIC/BOOL dang chuoi/bool
      // lech SQLite (NUMBER). Gan parser de 2 dialect giong nhau.
      types: {
        getTypeParser: (oid, format) => {
          if ([20, 21, 23, 1700, 700, 701].includes(oid)) {
            return (v) => (v === null ? null : Number(v));
          }
          if (oid === 16) {
            return (v) => (v === null ? null : v === 't' || v === 'true' || v === true);
          }
          return require('pg').types.getTypeParser(oid, format);
        },
      },
    });
  }
  return pgPool;
}
// DB-01 FIX v7: nguon thoi gian duy nhat o app (giong backend), khong dung ham date DB trong src
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

// DB-04: chuan hoa tra ID cho moi dialect (parity backend/src/common/db.js).
// GIU "RETURNING id" cho ca INSERT ... ON CONFLICT DO NOTHING (PG ho tro,
// conflict -> 0 dong, changes=0). Chi bo qua bang KHONG co cot `id`.
const NO_ID_TABLES = new Set([
  'products', 'departments', 'resource_dept', 'schema_migrations',
]);

/** Lay ten bang dich cua cau lenh INSERT/UPDATE/DELETE. */
function targetTable(sql) {
  const s = String(sql).trim();
  let m = /^\s*insert\s+into\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/i.exec(s);
  if (m) return m[1].toLowerCase();
  m = /^\s*update\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/i.exec(s);
  if (m) return m[1].toLowerCase();
  m = /^\s*delete\s+from\s+["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/i.exec(s);
  if (m) return m[1].toLowerCase();
  return null;
}

function withReturning(sql) {
  const s = String(sql).trim();
  if (/\breturning\b/i.test(s)) return s;
  if (!/^\s*(insert|update|delete)\b/i.test(s)) return s;
  const t = targetTable(s);
  if (t && NO_ID_TABLES.has(t)) return s;
  return s.replace(/\s*$/, '') + ' RETURNING id';
}

// TX-02/TX-03 parity backend: them FOR UPDATE tren PG, bo qua tren SQLite.
function withForUpdate(sql) {
  const s = String(sql).trim();
  if (DIALECT !== 'pg') return s;
  if (/\bfor\s+update\b/i.test(s)) return s;
  if (!/^\s*select\b/i.test(s)) return s;
  return s.replace(/\s*$/, '') + ' FOR UPDATE';
}

const { AppError } = require('./errors');

/**
 * P1-8 / DB-04: lay ID ban ghi vua tao — KHONG fallback ORDER BY id DESC.
 * Fail-fast thay vi ghi sai lien ket khi 2 request dong thoi.
 */
function insertedId(r, table, label = '') {
  const id = r && r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null;
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('INTERNAL', `Khong lay duoc id ban ghi vua tao${label ? ' (' + label + ')' : ''}`, 500);
  }
  return id;
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
        // TX-02/TX-03 parity backend: khoa dong hang chong lost-update.
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
      try { await client.query('ROLLBACK'); } catch { /* rollback fail */ }
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
      // BEGIN IMMEDIATE parity backend: lay khoa ghi ngay, tranh SQLITE_BUSY
      // khi nang cap tu deferred READ sang WRITE.
      db.exec('BEGIN IMMEDIATE');
      const conn = {
        query: (s, p = []) => Promise.resolve(db.prepare(s).all(...normParams(p))),
        get: (s, p = []) => Promise.resolve(db.prepare(s).get(...normParams(p)) || null),
        run: (s, p = []) => { const r = db.prepare(s).run(...normParams(p)); return Promise.resolve({ changes: r.changes, lastInsertRowid: r.lastInsertRowid }); },
        // SQLite khong co FOR UPDATE — tx da serialize (TX-01) nen doc-then-ghi
        // trong cung transaction la an toan.
        lock: async (s, p = []) => Promise.resolve(db.prepare(s).get(...normParams(p)) || null),
      };
      try {
        const out = await fn(conn);
        db.exec('COMMIT');
        return out;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch { /* rollback fail */ }
        throw e;
      }
    });
  } finally {
    release();
  }
}

module.exports = { query, get, all, run, tx, norm, nowVN, todayVN, businessDayVN, sinceVN, nowISO, DIALECT,
  withReturning, targetTable, withForUpdate, insertedId, NO_ID_TABLES, tzParts };