// scripts/exp-clean.cjs — Thi nghiem tren build hien tai (CSS da inline):
// bien the font / preloads / shell DOM de tim bottleneck THAT.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ORIG = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function run(route) {
  const out = path.join(require('os').tmpdir(), 'lh-c-' + Date.now() + '.json');
  const args = [
    path.join(ROOT, 'node_modules', 'lighthouse', 'cli', 'index.js'),
    'http://127.0.0.1:4173' + route,
    '--output', 'json', '--output-path', out,
    '--chrome-flags', '--headless=new --no-sandbox --disable-gpu',
    '--chrome-path', CHROME,
    '--only-categories=performance',
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    '--screenEmulation.width=390',
    '--screenEmulation.height=844',
    '--screenEmulation.deviceScaleFactor=2',
    '--throttling-method=simulate',
    '--throttling.rttMs=150',
    '--throttling.throughputKbps=1638.4',
    '--throttling.cpuSlowdownMultiplier=4',
    '--quiet',
  ];
  await new Promise((res, rej) => {
    const p = spawn(process.execPath, args, { shell: false });
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('fail'))));
  });
  const lhr = JSON.parse(fs.readFileSync(out, 'utf8'));
  const a = lhr.audits;
  fs.unlinkSync(out);
  const m = a['metrics'].details.items[0];
  const mt = a['mainthread-work-breakdown'];
  return {
    perf: Math.round(lhr.categories.performance.score * 100),
    FCP: Math.round(a['first-contentful-paint'].numericValue),
    LCP: Math.round(a['largest-contentful-paint'].numericValue),
    TBT: Math.round(a['total-blocking-time'].numericValue),
    obsFCP: Math.round(m.observedFirstContentfulPaint),
    obsLCP: Math.round(m.observedLargestContentfulPaint),
    mt: mt && mt.details ? mt.details.items.map((i) => i.groupLabel + '=' + Math.round(i.duration)).join(' ') : '',
  };
}

const FONT_TOKEN = /--font:"Be Vietnam Pro","BVP Fallback",[^;]*;/;
const noFontFaces = (h) =>
  h
    .replace(/<style id="bvp-font-faces">[\s\S]*?<\/style>/, '')
    .replace(FONT_TOKEN, '--font:system-ui,sans-serif;')
    .replace(/<link rel="preload" as="font"[^>]*>/g, '');
const noPreloads = (h) => h.replace(/<link rel="preload" as="font"[^>]*>/g, '');
const noModulePreload = (h) => h.replace(/<link rel="modulepreload"[^>]*>/g, '');
const deferJs = (h) => h.replace(/<script type="module"[^>]*><\/script>/, (m) => m.replace('<script ', '<script defer '));

(async () => {
  const variants = [
    ['1 current', ORIG],
    ['2 no font-face + no font preload', noFontFaces(ORIG)],
    ['3 no font preload only', noPreloads(ORIG)],
    ['4 no modulepreload', noModulePreload(ORIG)],
    ['5 defer module script', deferJs(ORIG)],
    ['6 no fonts + no modulepreload', noFontFaces(noModulePreload(ORIG))],
  ];
  for (const [name, html] of variants) {
    fs.writeFileSync(path.join(DIST, 'index.html'), html);
    const r = await run('/');
    console.log(
      name.padEnd(36),
      'Perf', String(r.perf).padStart(3),
      '| FCP', String(r.FCP).padStart(5),
      'LCP', String(r.LCP).padStart(5),
      'TBT', String(r.TBT).padStart(5),
      '| obsFCP', String(r.obsFCP).padStart(4),
      'obsLCP', String(r.obsLCP).padStart(4)
    );
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), ORIG);
  console.log('da khoi phuc index.html goc');
})().catch((e) => { console.error(e); fs.writeFileSync(path.join(DIST, 'index.html'), ORIG); process.exit(1); });
