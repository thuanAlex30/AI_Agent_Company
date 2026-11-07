// scripts/audit-pg-fk.cjs — Quet FK forward trong migration PostgreSQL.
// Usage: node scripts/audit-pg-fk.cjs [path/migration.sql]
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'backend', 'src', 'db', 'migrations', '001_init.postgres.sql');
if (!fs.existsSync(file)) {
  console.log('MISSING: ' + file);
  process.exit(0);
}
const src = fs.readFileSync(file, 'utf8');

// strip line comments (keep string literals intact enough for our purpose)
const lines = src.split('\n').map((l) => l.replace(/--.*$/, ''));

const order = [];
for (const ln of lines) {
  const m = ln.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  if (m) order.push(m[1]);
}
console.log('Tables (' + order.length + '): ' + order.join(', '));

// walk statements, track current table
let cur = null;
const violations = [];
const seenTables = new Set();
const stmts = [];
for (const ln of lines) {
  const cm = ln.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  if (cm) { cur = cm[1]; seenTables.add(cur); continue; }
  const rm = ln.match(/REFERENCES\s+"?(?:[a-zA-Z_]+\.)?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  if (rm && cur) {
    const t = rm[1];
    const ti = order.indexOf(t);
    const ci = order.indexOf(cur);
    stmts.push({ from: cur, to: t, ti, ci });
    if (ti > ci) violations.push(cur + ' -> ' + t + ' (created #' + ci + ' refs #' + ti + ')');
  }
}
console.log('\nFK references (' + stmts.length + '):');
for (const s of stmts) console.log('  ' + s.from + ' -> ' + s.to + (s.ti > s.ci ? '   <-- FORWARD' : ''));
console.log('\nFORWARD FK violations: ' + violations.length);
for (const v of violations) console.log('  ' + v);
process.exit(violations.length ? 1 : 0);
