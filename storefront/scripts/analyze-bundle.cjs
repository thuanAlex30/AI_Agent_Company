// scripts/analyze-bundle.cjs — Phan tich thanh phan bundle entry de tim nguyen nhan TBT.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

const entryJs = new Set();
for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) entryJs.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)) entryJs.add(m[1]);

console.log('=== Entry JS ===');
let totalGz = 0;
for (const rel of entryJs) {
  const f = path.join(DIST, rel.replace(/^\//, ''));
  if (!fs.existsSync(f)) continue;
  const buf = fs.readFileSync(f);
  const gz = zlib.gzipSync(buf, { level: 9 }).length;
  totalGz += gz;
  console.log(`  ${rel.padEnd(42)} ${(buf.length / 1024).toFixed(1)} kB raw  ${(gz / 1024).toFixed(1)} kB gzip`);
}
console.log(`  TONG ${(totalGz / 1024).toFixed(1)} kB gzip\n`);

// Dem so byte cua react/react-dom de biet phan nao la "framework tax"
const vendor = path.join(DIST, 'assets', 'vendor-react-FXDUqUlu.js');
if (fs.existsSync(vendor)) {
  const s = fs.readFileSync(vendor, 'utf8');
  console.log('=== vendor-react chunk ===');
  console.log('  kich thuoc:', (s.length / 1024).toFixed(1), 'kB');
  // React DOM chay DOM la 90% TBT. Dem cac marker.
  const markers = {
    'react-dom (scheduler)': (s.match(/unstable_scheduleCallback|flushSync|workLoop|performWorkUntilDeadline/g) || []).length,
    'scheduler': (s.match(/MessageChannel|postMessage/g) || []).length,
    'react-reconciler': (s.match(/commitRoot|completeWork|beginWork|reconcileChildren/g) || []).length,
  };
  for (const [k, v] of Object.entries(markers)) console.log(`  ${k}: ${v} lan`);
}

// Lat cac route chunk de xem route nao nang
console.log('\n=== Route chunks (lazy) ===');
const assets = path.join(DIST, 'assets');
const rows = [];
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith('.js')) continue;
  const buf = fs.readFileSync(path.join(assets, f));
  rows.push({ f, raw: buf.length, gz: zlib.gzipSync(buf, { level: 9 }).length });
}
rows.sort((a, b) => b.gz - a.gz);
for (const r of rows) console.log(`  ${r.f.padEnd(30)} ${(r.raw / 1024).toFixed(1)} kB raw  ${(r.gz / 1024).toFixed(1)} kB gzip`);

// CSS inline
const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];
let cssBytes = 0;
for (const m of inline) cssBytes += Buffer.byteLength(m[1]);
console.log(`\n=== CSS inline: ${(cssBytes / 1024).toFixed(1)} kB (${inline.length} khoi) ===`);

// Font
const fontDir = path.join(DIST, 'fonts');
let fb = 0;
if (fs.existsSync(fontDir)) for (const f of fs.readdirSync(fontDir)) fb += fs.statSync(path.join(fontDir, f)).size;
console.log(`=== Font: ${(fb / 1024).toFixed(1)} kB ===`);

// HTML
console.log(`=== HTML: ${(fs.statSync(path.join(DIST, 'index.html')).size / 1024).toFixed(1)} kB ===`);
