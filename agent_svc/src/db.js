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

function tzVN(d = new Date()) {
  return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
}
function nowVN() { return tzVN(new Date()); }
function todayVN() {
  const v = tzVN(new Date());
  return v.toISOString().slice(0, 10);
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
    });
  }
  return pgPool;
}
// DB-01 FIX v7: nguon thoi gian duy nhat o app (giong backend), khong dung ham date DB trong src
function businessDayVN(offsetDays = 0) {
  const v = tzVN(new Date());
  v.setDate(v.getDate() + offsetDays);
  return v.toISOString().slice(0, 10);
}
function sinceVN(days = 30) { return businessDayVN(-Math.abs(days)); }
function nowISO() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

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

// DB-04: chuan hoa tra ID cho moi dialect (xem backend/src/common/db.js).
function withReturning(sql) {
  const s = String(sql).trim();
  if (/\breturning\b/i.test(s)) return s;
  if (!/^\s*(insert|update|delete)\b/i.test(s)) return s;
  if (/\bon\s+conflict\b[\s\S]*\bdo\s+nothing\b/i.test(s)) return s;
  return s.replace(/\s*$/, '') + ' RETURNING id';
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
      db.exec('BEGIN');
      const conn = {
        query: (s, p = []) => Promise.resolve(db.prepare(s).all(...normParams(p))),
        get: (s, p = []) => Promise.resolve(db.prepare(s).get(...normParams(p)) || null),
        run: (s, p = []) => { const r = db.prepare(s).run(...normParams(p)); return Promise.resolve({ changes: r.changes, lastInsertRowid: r.lastInsertRowid }); },
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

module.exports = { query, get, all, run, tx, norm, nowVN, todayVN, businessDayVN, sinceVN, nowISO, DIALECT };