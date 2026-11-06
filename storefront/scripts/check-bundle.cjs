// scripts/check-bundle.cjs — Kiem tra ngan sach bundle (spec §7.1):
//   "JS ban dau <= 150 kB gzip"
// Tinh tong kich thuoc gzip cua JS NAY TRONG entry (khong phai lazy route chunks)
// + CSS + font, va in bang so lieu de CI chan regression.
//
//   node scripts/check-bundle.cjs [distDir] [maxJsGzipKb]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DIST = path.resolve(__dirname, '..', process.argv[2] || 'dist');
const MAX_JS_KB = Number(process.argv[3] || 150);
const MAX_TOTAL_KB = Number(process.argv[4] || 400);

function gzipSize(buf) {
  return zlib.gzipSync(buf, { level: 9 }).length;
}

function readHtml() {
  const f = path.join(DIST, 'index.html');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error('KHONG co thu muc ' + DIST + ' — hay chay `npm run build` truoc.');
    process.exit(1);
  }
  const html = readHtml();

  // Entry JS = cac <script src> trong index.html + modulepreload (React runtime)
  const entryJs = new Set();
  for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)) entryJs.add(m[1]);
  for (const m of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)) entryJs.add(m[1]);

  // CSS inline (khong con file .css rieng neu da inline) + file CSS con lai
  const inlineCss = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce((n, m) => n + Buffer.byteLength(m[1]), 0);

  const assetsDir = path.join(DIST, 'assets');
  const files = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];

  let jsRaw = 0;
  let jsGz = 0;
  const jsList = [];
  for (const rel of entryJs) {
    const f = path.join(DIST, rel.replace(/^\//, '').split('?')[0]);
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    const gz = gzipSize(buf);
    jsRaw += buf.length;
    jsGz += gz;
    jsList.push({ rel, raw: buf.length, gz });
  }

  // File CSS rieng (neu con)
  let cssRaw = 0;
  let cssGz = 0;
  for (const f of files) {
    if (!f.endsWith('.css')) continue;
    const buf = fs.readFileSync(path.join(assetsDir, f));
    cssRaw += buf.length;
    cssGz += gzipSize(buf);
  }

  // Font (chi 2 file preload tren-fold + phan con lai tinh rieng)
  let fontTotal = 0;
  const fontDir = path.join(DIST, 'fonts');
  if (fs.existsSync(fontDir)) {
    for (const f of fs.readdirSync(fontDir)) {
      fontTotal += fs.statSync(path.join(fontDir, f)).size;
    }
  }

  const kb = (n) => (n / 1024).toFixed(1);
  console.log('=== Ngan sach bundle (spec §7.1) ===');
  console.log('Entry JS ban dau (gzip):');
  for (const j of jsList) console.log('   ' + j.rel.padEnd(42) + kb(j.raw) + ' kB raw  ->  ' + kb(j.gz) + ' kB gzip');
  console.log('   TONG entry JS         : ' + kb(jsRaw) + ' kB raw  ->  ' + kb(jsGz) + ' kB gzip');
  console.log('CSS inline trong HTML   : ' + kb(inlineCss) + ' kB (chua gzip)');
  console.log('CSS file rieng (neu co) : ' + kb(cssGz) + ' kB gzip');
  console.log('Font WOFF2 (tat ca)     : ' + kb(fontTotal) + ' kB');
  console.log('TONG tai ve lan dau    : ' + kb(jsGz + inlineCss + cssGz + fontTotal) + ' kB');

  const totalGz = jsGz + inlineCss + cssGz + fontTotal;
  let fail = false;
  if (jsGz / 1024 > MAX_JS_KB) {
    console.error('\nFAIL: JS ban dau ' + kb(jsGz) + ' kB gzip > ngan sach ' + MAX_JS_KB + ' kB.');
    fail = true;
  }
  if (totalGz / 1024 > MAX_TOTAL_KB) {
    console.error('\nFAIL: Tong tai lan dau ' + kb(totalGz) + ' kB > ngan sach ' + MAX_TOTAL_KB + ' kB.');
    fail = true;
  }
  if (!fail) {
    console.log('\nPASS: JS ban dau ' + kb(jsGz) + ' kB gzip <= ' + MAX_JS_KB + ' kB; tong ' + kb(totalGz) + ' kB <= ' + MAX_TOTAL_KB + ' kB.');
  }
  process.exit(fail ? 1 : 0);
}

main();
