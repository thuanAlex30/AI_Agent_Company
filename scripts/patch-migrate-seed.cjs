// scripts/patch-migrate-seed.cjs — Patch migrate.js (P0-02/DB-02):
//   1. Seed chi chay khi explicit (--seed / ALLOW_AUTO_SEED=1); production tuyet doi khong seed.
//   2. Placeholder ngay __D_mN__/__D_pN__/__D_0__/__YM__ duoc tinh trong JS va thay bang chuoi literal.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'backend', 'src', 'db', 'migrate.js');
let s = fs.readFileSync(file, 'utf8');
const crlf = s.includes('\r\n');

const OLD_SNIPPET = `  // seed dev only
  const { get } = require('../common/db');
  const u = await get('SELECT COUNT(*) c FROM users');
  const wantSeed = process.argv.includes('--seed') || (u && Number(u.c) === 0 && process.env.NODE_ENV !== 'production');
  if (wantSeed) await seedDemo();
  else console.log('Seed skipped (users exist or NODE_ENV=production).');
}`;

const NEW_SNIPPET = `  // --- Seed: CHI chay khi duoc yeu cau tuyet doi ---
  // P0-02 / DB-02: truoc day seed tu chay khi DB rong o moi truong non-production.
  // Quy tac moi: seed demo CHI chay bang lenh explicit (\`npm run seed:demo\`)
  // hoac env ALLOW_AUTO_SEED=1 (chi dung o CI). Production: tuyet doi khong seed.
  const explicit = process.argv.includes('--seed') || process.env.ALLOW_AUTO_SEED === '1';
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && explicit) {
    console.warn('Seed skipped: production khong duoc auto-seed (nhung --seed da duoc truyen).');
  } else if (explicit) {
    const { get } = require('../common/db');
    const u = await get('SELECT COUNT(*) c FROM users');
    if (u && Number(u.c) === 0) {
      await seedDemo();
    } else {
      console.log('Seed skipped (users exist - seed idempotent, khong ghi de du lieu cu).');
    }
  } else {
    console.log('Seed skipped (chi chay bang \`npm run seed:demo\` hoac ALLOW_AUTO_SEED=1).');
  }
}`;

const OLD_SEED = `  sql = sql.replaceAll('__ADMIN_HASH__', adminHash).replaceAll('__USER_HASH__', userHash);`;

const NEW_SEED = `  sql = sql.replaceAll('__ADMIN_HASH__', adminHash).replaceAll('__USER_HASH__', userHash);

  // Thay placeholder ngay bang chuoi literal ngay (dialect-agnostic cho PG va SQLite).
  const dates = seedDateValues();
  sql = sql.replace(/__D_[mp]?\\d+__|__YM__/g, (tok) => {
    if (!(tok in dates)) throw new Error('Seed placeholder khong xac dinh: ' + tok);
    return "'" + dates[tok] + "'";
  });
  const leftover = sql.match(/__[A-Z0-9_]+__/g);
  if (leftover) {
    throw new Error('Seed con placeholder chua thay: ' + [...new Set(leftover)].join(', '));
  }`;

const SEED_FN = `
// Tinh cac placeholder ngay trong JS (khong dung date('now') cua SQLite).
// Ket qua la chuoi literal 'YYYY-MM-DD' / 'YYYY-MM' -> chay duoc tren ca 2 dialect.
function seedDateValues() {
  const tzVN = (d) => new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const shift = (offsetDays) => {
    const v = tzVN(new Date());
    v.setDate(v.getDate() + offsetDays);
    return v.toISOString().slice(0, 10);
  };
  const map = { __YM__: tzVN(new Date()).toISOString().slice(0, 7) };
  for (let i = 0; i <= 400; i++) {
    map[\`__D_m\${i}__\`] = shift(-i);
    map[\`__D_p\${i}__\`] = shift(i);
  }
  map.__D_0__ = shift(0);
  return map;
}
`;

function replaceOnce(src, needle, replacement, label) {
  // Khoi mau dung LF; file dich dung CRLF -> chuan hoa khi so sanh, giu nguyen EOL cua file.
  const crlfSrc = src.includes('\r\n');
  const norm = (t) => t.replace(/\r\n/g, '\n');
  let a = norm(src).indexOf(needle);
  if (a === -1) throw new Error('Khong tim thay khoi: ' + label);
  const flat = norm(src);
  if (flat.indexOf(needle, a + 1) !== -1) throw new Error('Khoi khong duy nhat: ' + label);
  const out = flat.slice(0, a) + replacement + flat.slice(a + needle.length);
  return crlfSrc ? out.replace(/\n/g, '\r\n') : out;
}

s = replaceOnce(s, OLD_SNIPPET, NEW_SNIPPET, 'seed gate');
s = replaceOnce(s, OLD_SEED, NEW_SEED, 'seed placeholder');
s = replaceOnce(s, '\nasync function seedDemo() {', SEED_FN + '\nasync function seedDemo() {', 'seedDateValues fn');

fs.writeFileSync(file, s);
console.log('Patched ' + file);
