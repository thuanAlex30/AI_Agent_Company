// scripts/css-audit.cjs — Tim CSS KHONG DUNG (dead CSS) + rule nong.
//
// Ly do can lam: CSS inline 36 kB. Do duoc (scripts/recalc-lab.cjs): Style recalc
// (UpdateLayoutTree) ~374ms, va NOI LINEAR voi SO RULE (css-half -> Style 153ms).
// Cat dead CSS = giam truc tiep thoi gian style recalc -> giam TBT.
//
// Quy tac: quet tat ca class/id/element selector trong CSS, roi so voi
//   - JSX/JS trong src/ (ten class, id, the html)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist', 'index.html');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

// 1) Thu thap "chuoi" (token) xuat hien trong code nguon
const codeText = walk(SRC)
  .filter((f) => /\.(jsx?|css)$/.test(f) && !f.includes('styles.css'))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

const used = new Set();
// className="..." / class="..." / clsx
for (const m of codeText.matchAll(/(?:className|class)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
  const raw = (m[1] || m[2] || m[3] || m[4] || '');
  for (const tok of raw.split(/[\s'"`{}$()?:,|+.]+/)) {
    const c = tok.trim();
    if (c && /^[A-Za-z][\w-]*$/.test(c)) used.add(c);
  }
}
// clsx-style: 'cls-' + cond -> ghi nhan phan "cls"
for (const m of codeText.matchAll(/'([a-z][\w-]*)'/g)) used.add(m[1]);
for (const m of codeText.matchAll(/"([a-z][\w-]*)"/g)) used.add(m[1]);
// template: `ui-btn btn-${x}`
for (const m of codeText.matchAll(/`([^`]*)`/g)) {
  for (const tok of m[1].split(/[\s'"`${}]+/)) {
    const c = tok.trim().replace(/^\/+/, '');
    if (c && /^[A-Za-z][\w-]*$/.test(c)) used.add(c);
  }
}
// id
for (const m of codeText.matchAll(/id\s*=\s*"([^"]+)"/g)) used.add(m[1]);
// hook/const ten CSS: bien "ui-btn", "pcard-h" ...
for (const m of codeText.matchAll(/\b([a-z][\w-]*)\b/g)) used.add(m[1]);

// 2) Doc CSS build
const html = fs.readFileSync(DIST, 'utf8');
const m = html.match(/<style id="bvp-app-css">([\s\S]*?)<\/style>/);
if (!m) { console.error('khong tim thay style app trong dist/index.html'); process.exit(1); }
const css = m[1];

// 3) Tach rule (bo @media/@keyframes de xu ly rieng)
const rules = [];
const re = /([^{}]+)\{([^{}]*)\}/g;
let mm;
while ((mm = re.exec(css))) {
  const sel = mm[1].trim();
  const body = mm[2].trim();
  rules.push({ sel, body, len: mm[0].length });
}

// 4) Voi moi selector, tach thanh tung selector con
const dead = [];
const live = [];
for (const r of rules) {
  if (r.sel.startsWith('@')) { live.push(r); continue; }
  const sels = r.sel.split(',').map((s) => s.trim()).filter(Boolean);
  let anyLive = false;
  for (const s of sels) {
    // lay class/id/element trong selector
    const tokens = [
      ...s.matchAll(/\.([A-Za-z_][\w-]*)/g),
      ...s.matchAll(/#([A-Za-z_][\w-]*)/g),
    ].map((x) => x[1]);
    const elems = (s.match(/(^|[\s>+~])([a-z][a-z0-9]*)/gi) || []).map((x) => (x[2] || '').toLowerCase()).filter(Boolean);
    // selector "phuc tap" -> giu lai (khong quyet dinh)
    if (!tokens.length && !elems.length) { anyLive = true; continue; }
    const hit = tokens.some((t) => used.has(t)) ||
      elems.some((t) => ['div', 'span', 'a', 'button', 'input', 'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'li', 'form', 'label', 'select', 'textarea', 'img', 'svg', 'main', 'nav', 'header', 'footer', 'section', 'article', 'strong', 'small', 'i', 'b', 'em', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'label', 'dialog', 'details', 'summary'].includes(t));
    if (hit) anyLive = true; else dead.push({ sel: s, body: r.body, len: s.length + r.body.length + 2 });
  }
  if (anyLive) live.push(r);
}

const deadBytes = dead.reduce((s, d) => s + d.len, 0);
console.log('=== CSS AUDIT ===');
console.log('CSS tong (inline):', css.length, 'bytes |', rules.length, 'rules');
console.log('Dead selectors:', dead.length, '| bytes uoc luong:', deadBytes,
  '(' + ((deadBytes / css.length) * 100).toFixed(1) + '% CSS)');
console.log('\n--- 40 dead selector dau (nho -> lon) ---');
for (const d of dead.sort((a, b) => a.len - b.len).slice(0, 40)) {
  console.log('  ' + d.sel.slice(0, 90) + '   {' + d.body.slice(0, 40) + '}');
}

fs.writeFileSync(path.join(__dirname, '..', 'css-dead.json'), JSON.stringify(dead, null, 1));
console.log('\n-> css-dead.json');
