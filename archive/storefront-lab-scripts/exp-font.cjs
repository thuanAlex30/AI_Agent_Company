// scripts/exp-font.cjs — Thi nghiem cach ly: do LCP voi bien the khac nhau.
// Bien:  base | nofont | nofontpreload | nowebfontcss
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ORIG = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const FONT_PRELOAD_RE = /<link rel="preload" as="font"[^>]*>/g;

function applyVariant(v) {
  let html = ORIG;
  if (v === 'nofont') {
    html = html.replace(/--font:"Be Vietnam Pro","BVP Fallback",[^;]*;/, '--font:system-ui,sans-serif;');
  } else if (v === 'nofontpreload') {
    html = html.replace(FONT_PRELOAD_RE, '');
  } else if (v === 'nowebfontcss') {
    html = html.replace(FONT_PRELOAD_RE, '');
    html = html.replace(/--font:"Be Vietnam Pro","BVP Fallback",[^;]*;/, '--font:system-ui,sans-serif;');
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
}

async function run(route) {
  const out = path.join(require('os').tmpdir(), 'lh-exp-' + Date.now() + '.json');
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
  return {
    perf: Math.round(lhr.categories.performance.score * 100),
    FCP: Math.round(a['first-contentful-paint'].numericValue),
    LCP: Math.round(a['largest-contentful-paint'].numericValue),
    CLS: a['cumulative-layout-shift'].numericValue.toFixed(3),
    TBT: Math.round(a['total-blocking-time'].numericValue),
  };
}

(async () => {
  for (const v of ['base', 'nofontpreload', 'nofont', 'nowebfontcss']) {
    applyVariant(v);
    const r = await run('/');
    console.log(v.padEnd(16), 'Perf', String(r.perf).padStart(3), '| FCP', String(r.FCP).padStart(5), 'LCP', String(r.LCP).padStart(5), 'CLS', r.CLS, 'TBT', r.TBT);
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), ORIG);
  console.log('da khoi phuc index.html goc');
})().catch((e) => { console.error(e); fs.writeFileSync(path.join(DIST, 'index.html'), ORIG); process.exit(1); });
