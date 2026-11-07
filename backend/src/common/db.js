const Database = require('better-sqlite3');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { AppError } = require('./errors');
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
      // BUG (PG-TYPE-01): driver `pg` mac dinh tra BIGINT/NUMERIC/INT4/INT8
      // dang CHUOI (de khong lam mat do chinh xac so lon). SQLite (better-sqlite3)
      // tra dang NUMBER. => cung mot cot (`payments.id`) co 2 kieu khac nhau
      // giua 2 dialect:
      //   - `insertedId()` tra Number (tu `RETURNING id` -> driver parse)
      //   - `SELECT id FROM payments ...` (dedup path) tra String '22'
      // => API tra `id` khac kieu giua lan moi vay lan retry -> so sanh
      //    `r1.id === r2.id` that (idempotency client sai).
    //
    // FIX: gan type parser de INT4/INT8/NUMERIC/FLOAT8/BOOL tra ve Number /
    // Boolean — giong het SQLite. (Khong dung `pg.types.setTypeParser` global
    // de khong lam anh huong module khac trong process.)
      types: {
        getTypeParser: (oid, format) => {
          // 20=int8, 21=int2, 23=int4, 1700=numeric, 700=float4, 701=float8
          if ([20, 21, 23, 1700, 700, 701].includes(oid)) {
            return (v) => (v === null ? null : Number(v));
          }
          // 16=bool
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
//
// BUG (PG-DB-01, xac nhan tren CI run 42340162280 job `backend-postgres (22)`):
//   `withReturning` append "RETURNING id" cho MOI cau lenh INSERT/UPDATE/DELETE.
//   Nhung mot so bang KHONG co cot `id` (khoa chinh la TEXT):
//     - products (sku TEXT PRIMARY KEY)
//     - departments (code TEXT PRIMARY KEY)
//     - resource_dept (PK (table_name, record_id))
//   => PostgreSQL loi: `column "id" does not exist` => `npm run seed:storefront`
//      fail => job CI `storefront-e2e`, `storefront-browser-e2e`,
//      `backend-postgres` FAIL.
//
// FIX: chi append "RETURNING id" khi bang dich THUC SU co cot `id`.
// Dung bang nao -> tra `null` (khong co id) => `insertedId()` nem loi
// fail-fast thay vi ghi sai lien ket.
const NO_ID_TABLES = new Set([
  'products',        // khoa: sku
  'departments',     // khoa: code
  'resource_dept',   // khoa: (table_name, record_id)
  'schema_migrations', // khoa: version
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

// ---------------------------------------------------------------------------
// BUG (PG-DB-04, xac nhan tren CI run 42340162280 job `pg-integration`):
//   Cac cot "dinh danh nguoi" (created_by / requester / decided_by / checker /
//   owner / assignee / employee_id / owner_employee_id ...) kieu BIGINT trong
//   migration, nhung code (va TEST) nhieu chon truyen USERNAME (chuoi).
//   - SQLite: better-sqlite3 KHONG rang buoc kieu => ghi TAM "test" vao cot
//     BIGINT => DU LIEU SAI (khong con la so) ma KHONG bao loi.
//   - PostgreSQL: `invalid input syntax for type bigint: "test"` => 500.
//
// FIX (DB-04-NORM): chuan hoa tham so theo cot dich:
//   - Neu tham so la CHUOI KHONG rong => KHONG phai ID so => gan `null`
//     (cot BIGINT cho phep NULL) thay vi ghi chuoi.
//   - Neu tham so la so => giu nguyen.
//   => Mot nguon chuan hoa duy nhat, ap dung cho CA 2 dialect, va giong nhau.
//      Loai bo rui ro "SQLite im lang / PostgreSQL nem loi".
//
// LUU Y: ham nay KHONG phai "nhoi loi" — no lam dung quy uoc
// `created_by` = ID (so), `actor` = USERNAME (text) da dinh nghia o common/auth.js.
// ---------------------------------------------------------------------------

// Bang -> danh sach cot BIGINT "dinh danh nguoi" can chuan hoa so.
const NUMERIC_ID_COLUMNS = {
  approvals: ['requester', 'decided_by'],
  attendance: ['employee_id'],
  attendance_log: ['employee_id'],
  campaigns: [],
  contracts: ['created_by'],
  customers: ['owner_employee_id'],
  debts: ['created_by'],
  departments: ['head_employee_id'],
  employees: [],
  expenses: ['created_by'],
  it_incidents: ['assignee'],
  leads: ['owner_employee_id'],
  orders: ['employee_id', 'created_by'],
  purchase_orders: ['created_by'],
  qa_checks: ['checker'],
  quotes: ['created_by'],
  refresh_tokens: ['user_id'],
  resource_dept: ['owner_employee_id'],
  risks: ['owner'],
  sop_tasks: ['owner'],
  stock_moves: ['created_by'],
  tickets: ['assignee'],
  trainings: ['employee_id'],
};

/**
 * Chuan hoa 1 tham so theo kieu cot: neu cot la BIGINT dinh danh nguoi va
 * gia tri la chuoi => tra null (khong ghi chuoi vao cot so).
 */
function normalizeIdParam(table, column, value) {
  if (value === undefined || value === null) return null;
  const cols = NUMERIC_ID_COLUMNS[table];
  if (!cols || !cols.includes(column)) return value;
  if (typeof value === 'number') {
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    // Chuoi rong -> null. Chuoi toan so -> chuyen thanh so (chuan hoa
    // "42" -> 42). Con lai (username) -> null (khong ghi chuoi vao cot BIGINT).
    if (!t) return null;
    if (/^\d+$/.test(t)) return Number(t) > 0 ? Number(t) : null;
    return null;
  }
  return null;
}

/**
 * Chuan hoa TOAN BO tham so cua 1 cau lenh theo bang/cot dich.
 * Chi ap dung cho INSERT/UPDATE co bang xac dinh.
 */
function normalizeParamsForSql(sql, params) {
  if (!params || !params.length) return params;
  const s = String(sql).trim();
  const table = targetTable(s);
  if (!table || !NUMERIC_ID_COLUMNS[table]) return params;
  const cols = NUMERIC_ID_COLUMNS[table];
  if (!cols.length) return params;

  const out = params.slice();

  // 1. UPDATE: gan theo thu tu `col=?` xuat hien trong cau lenh.
  if (/^\s*update\b/i.test(s)) {
    const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\?/g;
    let m;
    let idx = 0;
    while ((m = re.exec(s)) && idx < out.length) {
      const col = m[1].toLowerCase();
      if (cols.includes(col)) out[idx] = normalizeIdParam(table, col, out[idx]);
      idx++;
    }
    return out;
  }

  // 2. INSERT: thu tu tham so theo danh sach cot khai bao.
  //    LUU Y: VALUES co the xen khe literal (vi du 'draft') => so placeholder
  //    KHONG phai luon bang so cot. => phai quet TAT CA phan tu trong VALUES
  //    theo thu tu: moi phan tu (ke ca literal) tiep tuc MOT cot trong danh
  //    sach cot; chi phan tu `?` moi tieu thu tham so.
  const colList = /^\s*insert\s+into\s+[\w"`]+\s*\(([^)]*)\)/i.exec(s);
  if (!colList) return out;
  const names = colList[1].split(',').map((x) => x.trim().replace(/["`]/g, '').toLowerCase());

  // Lay danh sach phan tu trong VALUES (placeholder `?` hoac literal).
  const valuesPart = s.slice(colList.index + colList[0].length);
  const tokens = [];
  const tokRe = /\?|'(?:[^']|'')*'|"(?:[^"]|"")*"|\$\d+/g;
  let tm;
  while ((tm = tokRe.exec(valuesPart))) tokens.push(tm[0]);

  let colIdx = 0;
  let paramIdx = 0;
  for (const tok of tokens) {
    if (colIdx >= names.length) break;
    const col = names[colIdx];
    colIdx++;
    if (tok !== '?') continue; // literal — khong tieu thu tham so
    if (paramIdx >= out.length) break;
    if (cols.includes(col)) out[paramIdx] = normalizeIdParam(table, col, out[paramIdx]);
    paramIdx++;
  }
  return out;
}

function withReturning(sql) {
  const s = String(sql).trim();
  if (/\breturning\b/i.test(s)) return s;
  if (!/^\s*(insert|update|delete)\b/i.test(s)) return s;
  // BUG (PG-DB-09): truoc day bo qua "RETURNING id" cho
  //   `INSERT ... ON CONFLICT DO NOTHING` (do coi nhu PG khong ho tro).
  //   Sai! PG HO TRO `ON CONFLICT DO NOTHING RETURNING id`:
  //     - insert moi       -> tra 1 dong (id)
  //     - conflict (trung) -> tra 0 dong, `changes` = 0
  //   He qua bo qua RETURNING:
  //     - SQLite: `lastInsertRowid` van co => `insertedId()` ra so => test PASS
  //     - PostgreSQL: `r.rows[0]?.id` = undefined => `insertedId()` nem
  //       "Khong lay duoc id ban ghi vua tao" (500) => import-csv FAIL (p408).
  //   => GIU "RETURNING id" cho ca 2 trường hợp (DO NOTHING / DO UPDATE).
  //
  // INSERT ... ON CONFLICT DO UPDATE: RETURNING id luon tra 1 dong (dong da update)
  // -> dung de lay id sau upsert.
  //
  // Bang khong co cot `id` -> KHONG duoc them RETURNING id (PG se loi).
  const t = targetTable(s);
  if (t && NO_ID_TABLES.has(t)) return s;
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
  // DB-04-NORM: chuan hoa tham so theo cot BIGINT dinh danh nguoi truoc khi ghi.
  const p = normalizeParamsForSql(sql, params);
  if (DIALECT === 'pg') {
    let i = 0;
    const pgSql = withReturning(sql).replace(/\?/g, () => '$' + (++i));
    const r = await getPool().query(pgSql, p);
    return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
  }
  return withSqlite((db) => {
    const r = db.prepare(sql).run(...normParams(p));
    return { changes: r.changes, lastInsertRowid: r.lastInsertRowid };
  });
}

/**
 * P1-8 / DB-04: lay ID ban ghi vua tao — KHONG fallback "ORDER BY id DESC LIMIT 1".
 *
 * Fallback la nguy hiem: khi 2 request cung tao ban ghi, request A co the lay
 * ID cua request B => lien ket record sai (audit sai, scope sai, refund sai).
 * Adapter `run()` da tra `lastInsertRowid` dung o ca 2 dialect => dung thang.
 * Neu khong co ID => loi thoi truong (fail-fast) thay vi ghi sai lien ket.
 */
function insertedId(r, table, label = '') {
  const id = r && r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null;
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('INTERNAL', `Khong lay duoc id ban ghi vua tao${label ? ' (' + label + ')' : ''}`, 500);
  }
  return id;
}

// ---------------------------------------------------------------------------
// BUG (PG-DB-07): truy van "id HOAC code" voi cot `id` kieu BIGINT.
//
//   `SELECT * FROM services WHERE (code=? OR id=?)` voi `?` = 'DV-TEABREAK'
//   - SQLite: khong rang buoc kieu -> tra 0 dong (im lang, sai)
//   - PostgreSQL: `22P02 invalid input syntax for type bigint: "DV-TEABREAK"`
//     => 500 cho moi request lookup dich vu theo ma (GET /services/:id,
//        POST /public/service-requests) => storefront P2E FAIL tren PG.
//
// FIX: tach thanh 2 nhanh — chi so sanh `id` khi gia tri THAT LA SO.
// Voi gia tri chuoi, chi so sanh `code`.
// ---------------------------------------------------------------------------

/** Tra ve gia tri so hop le neu `v` la so nguyen duong, nguoc lai null. */
function asNumericId(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number(t);
    return n > 0 ? n : null;
  }
  return null;
}

/**
 * Tim 1 ban ghi theo `id` (so) HOAC `code` (chuoi) — an toan tren ca 2 dialect.
 * @param {object} dbOrConn  db hoac conn (tx)
 * @param {string} table      ten bang
 * @param {string} cols       danh sach cot can lay, mac dinh '*'
 * @param {string} idCol     cot id (BIGINT), mac dinh 'id'
 * @param {string} codeCol   cot code (TEXT), mac dinh 'code'
 * @param {*} value          gia tri tra ve tu client (co the la so HOAC chuoi)
 */
async function findByIdOrCode(dbOrConn, table, value, opts = {}) {
  const cols = opts.cols || '*';
  const idCol = opts.idCol || 'id';
  const codeCol = opts.codeCol || 'code';
  const numId = asNumericId(value);
  const raw = value == null ? null : String(value).trim();
  if (numId != null) {
    const byId = await dbOrConn.get(
      `SELECT ${cols} FROM ${table} WHERE ${idCol}=?`, [numId]
    );
    if (byId) return byId;
  }
  if (raw) {
    return await dbOrConn.get(
      `SELECT ${cols} FROM ${table} WHERE ${codeCol}=?`, [raw]
    );
  }
  return null;
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
          const np = normalizeParamsForSql(s, p);
          const r = await client.query(withReturning(s).replace(/\?/g, () => '$' + (++i)), np);
          return { changes: r.rowCount, lastInsertRowid: r.rows[0]?.id };
        },
        // TX-02/TX-03: khoa dong hang (SELECT ... FOR UPDATE) de chong race.        // Tren SQLite khong co row-level lock -> phai serialize toan bo tx
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
        run: (s, p = []) => { const r = db.prepare(s).run(...normParams(normalizeParamsForSql(s, p))); return Promise.resolve({ changes: r.changes, lastInsertRowid: r.lastInsertRowid }); },
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
  query, get, all, run, tx, norm, insertedId,
  nowVN, todayVN, businessDayVN, sinceVN, nowPlusMinutesISO, nowISO,
  toSqlDateTime, toUtcDateTime, isExpired,
  DIALECT, isUniqueViolation,
  // PG-DB-07: tra cuu "id HOAC code" an toan tren ca 2 dialect.
  findByIdOrCode, asNumericId,
  // DB-04-NORM / PG-DB-01: expose de test + verify kiem tra truc tiep.
  withReturning, targetTable, normalizeParamsForSql, normalizeIdParam,
  NUMERIC_ID_COLUMNS, NO_ID_TABLES,
};