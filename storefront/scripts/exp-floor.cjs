// scripts/exp-floor.cjs — Do san floor: trang HTML tinh (shell) vs trang day du.
// Muc dich: biet LCP 3s do (a) shell + critical CSS, hay (b) tai JS/CSS.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ORIG = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function run(route) {
  const out = path.join(require('os').tmpdir(), 'lh-floor-' + Date.now() + '.json');
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
  const ph = (a['largest-contentful-paint-element']?.details?.items || [])[1];
  return {
    perf: Math.round(lhr.categories.performance.score * 100),
    FCP: Math.round(a['first-contentful-paint'].numericValue),
    LCP: Math.round(a['largest-contentful-paint'].numericValue),
    TBT: Math.round(a['total-blocking-time'].numericValue),
    TTFB: Math.round(a['server-response-time'].numericValue),
    obsFCP: Math.round(a['metrics'].details.items[0].observedFirstContentfulPaint),
    obsLCP: Math.round(a['metrics'].details.items[0].observedLargestContentfulPaint),
    phases: ph ? ph.items.map((p) => p.phase + '=' + Math.round(p.timing)).join(' ') : '',
  };
}

// Shell tinh: chi HTML + critical CSS inline, KHONG script, KHONG stylesheet ngoai.
function staticShell() {
  let html = ORIG;
  html = html.replace(/<link rel="preload" as="style"[^>]*><noscript>.*?<\/noscript>/s, '');
  html = html.replace(/<script type="module"[^>]*><\/script>/g, '');
  return html;
}

(async () => {
  const variants = [
    ['full (current)', ORIG],
    ['shell-only (no JS/CSS)', staticShell()],
  ];
  for (const [name, html] of variants) {
    fs.writeFileSync(path.join(DIST, 'index.html'), html);
    const r = await run('/');
    console.log(
      name.padEnd(26),
      'Perf', String(r.perf).padStart(3),
      '| FCP', String(r.FCP).padStart(5),
      'LCP', String(r.LCP).padStart(5),
      'TBT', String(r.TBT).padStart(5),
      '| obsFCP', r.obsFCP,
      'obsLCP', r.obsLCP,
      '|', r.phases
    );
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), ORIG);
  console.log('da khoi phuc index.html goc');
})().catch((e) => { console.error(e); fs.writeFileSync(path.join(DIST, 'index.html'), ORIG); process.exit(1); });
