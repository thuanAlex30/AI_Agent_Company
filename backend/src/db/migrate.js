const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DIALECT = process.env.PG_HOST ? 'pg' : 'sqlite';
const SQLITE_PATH = process.env.DATABASE_PATH || './data/bizops.db';
const MIG_DIR = __dirname + '/migrations';

/**
 * Phase 0.4 — tach SQL thanh TUNG statement.
 *
 * Van de cu: `db.exec(sql)` cho ca 1 file. Lan migrate thu 2, loi
 * "duplicate column name" xay ra o ALTER TABLE dau tien => ca file bi abort
 * => cac CREATE TABLE phia sau KHONG BAO GIO duoc tao. He thong "migrate
 * idempotent" ma thuc te la "migrate mot lan, lan sau ban ra".
 *
 * Fix: tach thanh statement va chay tung statement. Bo qua CHINH XAC loi
 * "duplicate column name" (SQLite) / "already exists" (PG) — truong hop da
 * migrate roi. Moi loi khac -> nem ra ngay (khong nuot).
 *
 * Splitter phai an toan voi:
 *   - string literal '...' (ke ca '' escape)
 *   - comment 1 dong (--) va comment khoi
 *   - dollar-quoted $$ ... $$ (PostgreSQL)
 *   - trigger: CREATE TRIGGER ... BEGIN ... END;  (co ';' ben trong)
 */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inDollar = false;
  let dollarTag = '';
  // Phase 0.4: SQLite trigger co body "BEGIN <stmts> END;" — dau ';' ben trong
  // body KHONG phai het cau lenh. => khi dang trong CREATE TRIGGER, chi ket
  // thuc statement khi gap `END;` o CUOI buffer.
  let inTrigger = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      buf += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (ch === '*' && next === '/') { buf += next; i++; inBlockComment = false; }
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'") {
        if (next === "'") { buf += next; i++; }   // escape ''
        else inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '"') {
        if (next === '"') { buf += next; i++; }
        else inDouble = false;
      }
      continue;
    }
    if (inDollar) {
      buf += ch;
      if (ch === '$' && sql.startsWith(dollarTag, i)) {
        buf += sql.slice(i + 1, i + dollarTag.length);
        i += dollarTag.length - 1;
        inDollar = false;
      }
      continue;
    }

    // --- trong code (khong phai string/comment) ---
    if (ch === '-' && next === '-') { inLineComment = true; buf += ch; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; buf += ch; continue; }
    if (ch === "'") { inSingle = true; buf += ch; continue; }
    if (ch === '"') { inDouble = true; buf += ch; continue; }
    if (ch === '$') {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) { inDollar = true; dollarTag = m[0]; buf += m[0]; i += m[0].length - 1; continue; }
    }
    buf += ch;

    // Bat dau 1 statement moi -> kiem tra co phai CREATE TRIGGER khong.
    if (!inTrigger && /^\s*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i.test(buf)) {
      inTrigger = true;
      continue;
    }
    if (ch === ';') {
      if (inTrigger) {
        // Chi ket thuc trigger khi gap END; o cuoi.
        if (/\bEND\s*;\s*$/i.test(buf)) {
          const stmt = buf.trim();
          if (stmt) out.push(stmt);
          buf = '';
          inTrigger = false;
        }
        continue;
      }
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = '';
      continue;
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/** Loai bo comment dau/cuoi + khoang trang thua, de error message de doc. */
function stmtLabel(stmt) {
  return stmt.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
}

const IGNORABLE_SQLITE = /duplicate column name/i;
const IGNORABLE_PG = /(already exists|duplicate key value violates unique constraint)/i;

function fileVersion(file) {
  return file.replace('.postgres.sql', '').replace('.sql', '');
}

async function migrate() {
  const files = DIALECT === 'pg'
    ? ['001_init.postgres.sql', '002_storefront.postgres.sql', '003_datetime_normalize.postgres.sql', '004_session.postgres.sql', '005_dept_scope.postgres.sql', '006_backfill_dept_scope.postgres.sql', '007_qa_ref_id_text.postgres.sql']
    : ['001_init.sql', '002_storefront.sql', '003_datetime_normalize.sql', '004_session.sql', '005_dept_scope.sql', '006_backfill_dept_scope.sql', '007_qa_ref_id_text.sql'];

  if (DIALECT === 'pg') {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.PG_HOST, port: process.env.PG_PORT || 5432,
      user: process.env.PG_USER, password: process.env.PG_PASSWORD,
      database: process.env.PG_DB,
    });
    const client = await pool.connect();
    try {
      await client.query(
        'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
      );
      // Phase 0.4: DOC schema_migrations de BO QUA file da apply.
      // Truoc day chi GHI vao, nen chay lai van exec toan bo file.
      const { rows } = await client.query('SELECT version FROM schema_migrations');
      const applied = new Set(rows.map((r) => r.version));

      for (const file of files) {
        const ver = fileVersion(file);
        if (applied.has(ver)) { console.log('Skip (da apply):', ver); continue; }
        const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf8');
        for (const stmt of splitStatements(sql)) {
          try {
            await client.query(stmt);
          } catch (e) {
            // ADD COLUMN/CREATE INDEX da ton tai -> bo qua (idempotent).
            if (IGNORABLE_PG.test(String(e.message || ''))) {
              console.warn('Skip (da co):', stmtLabel(stmt));
              continue;
            }
            throw new Error(`[migrate] ${ver}: ${stmtLabel(stmt)}\n  -> ${e.message}`);
          }
        }
        await client.query(
          'INSERT INTO schema_migrations(version, applied_at) VALUES($1, CURRENT_TIMESTAMP) ON CONFLICT(version) DO NOTHING',
          [ver]
        );
        console.log('Migrated:', ver);
      }
    } finally { client.release(); await pool.end(); }
  } else {
    const Database = require('better-sqlite3');
    fs.mkdirSync(path.dirname(path.resolve(SQLITE_PATH)), { recursive: true });
    const db = new Database(SQLITE_PATH, { timeout: 10000 });
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 10000');
    db.pragma('foreign_keys = ON');
    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime(\'now\')))'
    );
    const applied = new Set(
      db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version)
    );

    for (const file of files) {
      const ver = fileVersion(file);
      if (applied.has(ver)) { console.log('Skip (da apply):', ver); continue; }
      const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf8');
      for (const stmt of splitStatements(sql)) {
        try {
          db.exec(stmt);
        } catch (e) {
          if (IGNORABLE_SQLITE.test(String(e.message || ''))) {
            console.warn('Skip (da co cot):', stmtLabel(stmt));
            continue;
          }
          throw new Error(`[migrate] ${ver}: ${stmtLabel(stmt)}\n  -> ${e.message}`);
        }
      }
      db.prepare(
        "INSERT INTO schema_migrations(version, applied_at) VALUES(?, CURRENT_TIMESTAMP) ON CONFLICT(version) DO NOTHING"
      ).run(ver);
      console.log('Migrated:', ver);
    }
    db.close();
  }

  // --- Seed: CHI chay khi duoc yeu cau tuyet doi ---
  // P0-02 / DB-02: truoc day seed tu chay khi DB rong o moi truong non-production.
  // Quy tac moi: seed demo CHI chay bang lenh explicit (`npm run seed:demo`)
  // hoac env ALLOW_AUTO_SEED=1 (chi dung o CI). Production: tuyet doi khong seed.
  const explicit = process.argv.includes('--seed') || process.env.ALLOW_AUTO_SEED === '1';
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && explicit) {
    console.warn('Seed skipped: production khong duoc auto-seed (nhung --seed da duoc truyen).');
  } else if (explicit) {
    const { get } = require('../common/db');
    // PHASE 0.1 (fix race): kiem tra DUNG user seed ('admin') — KHONG phai
    // COUNT(*). Nhiều file test chạy song song: 1 file có thể tạo user riêng
    // TRƯỚC khi seed chạy => COUNT(*) > 0 => seed bị skip => thiếu 'admin'
    // => test fail lung tung.
    const admin = await get("SELECT id FROM users WHERE username='admin'");
    if (!admin) {
      await seedDemo();
    } else {
      console.log('Seed skipped (user admin da ton tai - seed idempotent, khong ghi de du lieu cu).');
    }
  } else {
    console.log('Seed skipped (chi chay bang `npm run seed:demo` hoac ALLOW_AUTO_SEED=1).');
  }
}

// Tinh cac placeholder ngay trong JS (khong dung date('now') cua SQLite).
// Ket qua la chuoi literal 'YYYY-MM-DD' / 'YYYY-MM' -> chay duoc tren ca 2 dialect.
// Phase 0.5: dung helper thoi gian VN da sua (khong con lech 1 ngay 00:00-07:00).
function seedDateValues() {
  const { businessDayVN, todayVN } = require('../common/db');
  const map = { __YM__: todayVN().slice(0, 7) };
  for (let i = 0; i <= 400; i++) {
    map[`__D_m${i}__`] = businessDayVN(-i);
    map[`__D_p${i}__`] = businessDayVN(i);
  }
  map.__D_0__ = businessDayVN(0);
  return map;
}

async function seedDemo() {
  const seedPath = path.join(__dirname, 'seeds/demo.sql');
  let sql = fs.readFileSync(seedPath, 'utf8');
  const adminHash = await bcrypt.hash('Admin@123', 10);
  const userHash = await bcrypt.hash('User@123', 10);
  sql = sql.replaceAll('__ADMIN_HASH__', adminHash).replaceAll('__USER_HASH__', userHash);

  // Thay placeholder ngay bang chuoi literal ngay (dialect-agnostic cho PG va SQLite).
  const dates = seedDateValues();
  sql = sql.replace(/__D_[mp]?\d+__|__YM__/g, (tok) => {
    if (!(tok in dates)) throw new Error('Seed placeholder khong xac dinh: ' + tok);
    return "'" + dates[tok] + "'";
  });
  const leftover = sql.match(/__[A-Z0-9_]+__/g);
  if (leftover) {
    throw new Error('Seed con placeholder chua thay: ' + [...new Set(leftover)].join(', '));
  }

  if (DIALECT === 'pg') {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.PG_HOST, port: process.env.PG_PORT || 5432,
      user: process.env.PG_USER, password: process.env.PG_PASSWORD,
      database: process.env.PG_DB,
    });
    const client = await pool.connect();
    try { await client.query(sql); } finally { client.release(); await pool.end(); }
  } else {
    const Database = require('better-sqlite3');
    const db = new Database(SQLITE_PATH);
    db.pragma('foreign_keys = ON');
    db.exec(sql);
    db.close();
  }
  console.log('Seeded demo.');
}

if (require.main === module) {
  migrate().then(() => { console.log('DB ready'); process.exit(0); })
    .catch(e => { console.error('MIGRATE FAIL:', e.message); process.exit(1); });
}
module.exports = { migrate, splitStatements };
