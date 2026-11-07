// scripts/seed-dates.cjs — Bien doi demo.sql de khong con ham ngay SQLite-only.
// Thay moi ham ngay bang placeholder __D_<offset>__ / __YM__;
// gia tri duoc tinh trong JavaScript (migrate.js) va truyen qua tham so.
// => Cung mot file seed chay duoc tren PostgreSQL va SQLite.
//
// Quy uoc placeholder:
//   __D_m10__  = 10 ngay truoc      __D_p20__ = 20 ngay sau
//   __D_0__   = hom nay             __YM__    = 'YYYY-MM' (thang hien tai)
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'backend', 'src', 'db', 'seeds', 'demo.sql');
let sql = fs.readFileSync(file, 'utf8');
const before = sql;

function offsetToken(raw) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  if (v === 0) return '__D_0__';
  return v < 0 ? `__D_m${-v}__` : `__D_p${v}__`;
}

// date('now','-10 days') / date('now','+20 days') / date('now','-1 day')
sql = sql.replace(/date\('now'\s*,\s*'([+-]?\d+)\s+days?'\)/g, (m, n) => offsetToken(n) || m);
// date('now')
sql = sql.replace(/date\('now'\)/g, '__D_0__');
// strftime('%Y-%m','now')
sql = sql.replace(/strftime\('%Y-%m'\s*,\s*'now'\)/g, '__YM__');

const leftover = sql.match(/date\('now'|strftime\(/g) || [];
if (leftover.length) {
  console.error('CON HAM NGAY CHUA XU LY: ' + leftover.length);
  process.exit(1);
}
if (sql === before) {
  console.log('Khong co thay doi.');
  process.exit(0);
}
fs.writeFileSync(file, sql);
console.log('Da thay placeholder trong ' + file);
const toks = [...new Set(sql.match(/__D_[mp]?\d+__|__YM__/g) || [])].sort();
console.log('  Placeholder dung: ' + toks.join(', '));
