const Database = require('better-sqlite3');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
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

// normalize tieng Viet: NFD + map d/D (mau chuan v6.1)
function norm(s = '') {
  return String(s).toLowerCase().normalize('NFD')
    .replace(/[đ]/g, 'd').replace(/[Đ]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function query(sql, params = []) {
  if (DIALECT === 'pg') {
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => '$' + (++i));
    const r = await getPool().query(pgSql, params);
    return r.rows;
  }
  return getSqlite().prepare(sql).all(...params);
}
async function get(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}
async function all(sql, params = []) { return query(sql, params); }
async function run(sql, params = []) {
  if (DIALECT === 'pg') {
    let i = 0;
    const pgSql = sql.replace(/\?/g, () => '$' + (++i));
    const r = await getPool().query(pgSql, params);
    return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
  }
  const r = getSqlite().prepare(sql).run(...params);
  return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
}
async function tx(fn) {
  if (DIALECT === 'pg') {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const conn = {
        query: (s, p = []) => { let i = 0; return client.query(s.replace(/\?/g, () => '$' + (++i)), p).then(r => r.rows); },
        get: async (s, p = []) => (await conn.query(s, p))[0] || null,
        run: async (s, p = []) => { let i = 0; const r = await client.query(s.replace(/\?/g, () => '$' + (++i)), p); return { changes: r.rowCount }; },
      };
      const out = await fn(conn);
      await client.query('COMMIT');
      return out;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  const db = getSqlite();
  db.exec('BEGIN');
  try {
    const conn = {
      query: (s, p = []) => Promise.resolve(db.prepare(s).all(...p)),
      get: (s, p = []) => Promise.resolve(db.prepare(s).get(...p) || null),
      run: (s, p = []) => { const r = db.prepare(s).run(...p); return Promise.resolve({ changes: r.changes, lastInsertRowid: r.lastInsertRowid }); },
    };
    const out = await fn(conn);
    db.exec('COMMIT');
    return out;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { query, get, all, run, tx, norm, nowVN, todayVN, DIALECT };
