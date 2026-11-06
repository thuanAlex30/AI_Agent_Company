// scripts/exp-fd.cjs — Sweep `font-display` + fallback metric overrides tren
// dist/index.html (build khong can chay lai) va do bang bench nhanh.
// Muc dich: tim cau hinh font giup LCP chi duoc ghi MOT LAN.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ORIG = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

function setDisplay(html, val) {
  // Chi doi trong khoi @font-face inline (id="bvp-font-faces")
  return html.replace(/(<style id="bvp-font-faces">[\s\S]*?<\/style>)/, (m) =>
    m.replace(/font-display:\s*\w+;/g, 'font-display: ' + val + ';')
  );
}

function setOverrides(html, asc, desc) {
  return html.replace(/ascent-override:\s*[\d.]+%;/g, 'ascent-override: ' + asc + '%;')
    .replace(/descent-override:\s*[\d.]+%;/g, 'descent-override: ' + desc + '%;');
}

function bench(label) {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'bench.cjs'), '5', '/'], { encoding: 'utf8' });
  const l1 = out.split('\n')[0].replace(/^route=\/\s*/, '');
  const l2 = (out.split('\n')[1] || '').trim();
  console.log(label.padEnd(30) + l1);
  console.log('   ' + l2);
}

const variants = [
  ['A optional (current)', ORIG],
  ['B swap', setDisplay(ORIG, 'swap')],
  ['C block', setDisplay(ORIG, 'block')],
  ['D fallback + font-display', setDisplay(ORIG, 'font-display')],
  ['E swap + win-metrics override', setOverrides(setDisplay(ORIG, 'swap'), '126.1', '26.5')],
  ['F optional + win-metrics', setOverrides(setDisplay(ORIG, 'optional'), '126.1', '26.5')],
];

try {
  for (const [name, html] of variants) {
    fs.writeFileSync(path.join(DIST, 'index.html'), html);
    bench(name);
  }
} finally {
  fs.writeFileSync(path.join(DIST, 'index.html'), ORIG);
  console.log('da khoi phuc index.html goc');
}
