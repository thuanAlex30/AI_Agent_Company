// scripts/fix-pg-fk-order.cjs — Sap xep lai CREATE TABLE trong migration PostgreSQL
// theo thu tu topo (FK forward -> "relation does not exist").
//
// An toan:
//   - Tach SQL thanh statement (ton trong string literal va dollar-quoted body)
//   - Moi "khoi" = 1 CREATE TABLE + cac statement theo sau no (INDEX/TRIGGER/FUNCTION/VIEW)
//   - Cac khoi duoc HOAN DOI cho nhau; thu tu TRONG khoi giu nguyen
//   - Validate: multiset statement truoc == sau (khong mat/duplicate)
//   - Sau khi sap xep, phai KHONG con forward FK
const fs = require('fs');
const path = require('path');

const file = process.argv.find((a) => a.endsWith('.sql')) || path.join(__dirname, '..', 'backend', 'src', 'db', 'migrations', '001_init.postgres.sql');
const WRITE = process.argv.includes('--write');
const src = fs.readFileSync(file, 'utf8');

/** Tach SQL thanh statement, ton trong dollar-quoted bodies ($$ ... $$) va string literal. */
function splitStatements(sql) {
  const out = [];
  let buf = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl + 1;
      buf += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "'") {
      let j = i + 1;
      buf += ch;
      while (j < sql.length) {
        buf += sql[j];
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { buf += sql[j + 1]; j += 2; continue; }
          break;
        }
        j++;
      }
      i = j + 1;
      continue;
    }
    if (ch === '$' && sql[i + 1] === '$') {
      const end = sql.indexOf('$$', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === ';') {
      buf += ch;
      out.push(buf);
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function tableOf(stmt) {
  const m = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  return m ? m[1] : null;
}
function refsOf(stmt) {
  const out = [];
  const re = /REFERENCES\s+"?(?:[a-zA-Z_]+\.)?([a-zA-Z_][a-zA-Z0-9_]*)"?/gi;
  let m;
  while ((m = re.exec(stmt))) out.push(m[1]);
  return out;
}

const statements = splitStatements(src);

// 1) Gom thanh khoi: CREATE TABLE + cac statement lien quan theo sau
const blocks = [];
const head = [];
let cur = null;
for (const st of statements) {
  const t = tableOf(st);
  if (t) {
    cur = { table: t, stmts: [st] };
    blocks.push(cur);
    continue;
  }
  if (cur) cur.stmts.push(st);
  else head.push(st);
}

const byTable = new Map(blocks.map((b) => [b.table, b]));

// 2) Topo sort
const deps = new Map(blocks.map((b) => [b.table, refsOf(b.stmts[0]).filter((t) => byTable.has(t) && t !== b.table)]));
const order = [];
const state = new Map();
const cyclic = [];
function visit(t, stack) {
  if (state.get(t) === 1) return;
  if (state.get(t) === 0) { cyclic.push(stack.concat(t).join(' -> ')); return; }
  state.set(t, 0);
  for (const d of deps.get(t) || []) visit(d, stack.concat(t));
  state.set(t, 1);
  order.push(byTable.get(t));
}
for (const b of blocks) visit(b.table, []);

if (cyclic.length) {
  console.error('CHU TRINH FK khong duoc xu ly tu dong: ' + cyclic.join(' | '));
  process.exit(1);
}

// 3) Tai tao
const parts = [...head];
for (const b of order) for (const s of b.stmts) parts.push(s);
const next = parts.join('');

// 4) Validate
function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
const beforeSet = new Set(statements.map(norm));
const afterSet = new Set(splitStatements(next).map(norm));
const lost = [...beforeSet].filter((s) => !afterSet.has(s));
const added = [...afterSet].filter((s) => !beforeSet.has(s));
console.log('Statements truoc: ' + statements.length + ' | sau: ' + splitStatements(next).length);
console.log('Mat: ' + lost.length + (lost.length ? ' -> ' + lost.map((x) => x.slice(0, 100)).join(' || ') : ''));
console.log('Them: ' + added.length + (added.length ? ' -> ' + added.map((x) => x.slice(0, 100)).join(' || ') : ''));
if (lost.length || added.length) { console.error('ABORT: statement khong khop'); process.exit(1); }

// 5) Kiem tra forward FK con lai
const order2 = splitStatements(next).filter((s) => tableOf(s)).map(tableOf);
const fwd = [];
for (const st of splitStatements(next)) {
  const t = tableOf(st);
  if (!t) continue;
  for (const r of refsOf(st)) {
    const ri = order2.indexOf(r);
    if (ri > order2.indexOf(t)) fwd.push(t + ' -> ' + r);
  }
}
console.log('Forward FK con lai: ' + (fwd.length ? fwd.join(', ') : 'KHONG'));
if (fwd.length) { console.error('ABORT: van con forward FK'); process.exit(1); }

if (WRITE) {
  fs.writeFileSync(file, next);
  console.log('DA GHI: ' + file);
} else {
  console.log('(dry-run — them --write de ghi)');
}
console.log('Thu tu moi: ' + order2.join(', '));
