// scripts/lh-one.cjs — Do Lighthouse nhanh cho MOT route (de lặp nhanh khi tinh chỉnh).
//   node scripts/lh-one.cjs <path> [baseUrl]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROUTE = process.argv[2] || '/';
const BASE = process.argv[3] || 'http://127.0.0.1:4173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const out = path.join(require('os').tmpdir(), 'lh-one-' + Date.now() + '.json');
  const args = [
    path.join(__dirname, '..', 'node_modules', 'lighthouse', 'cli', 'index.js'),
    BASE + ROUTE,
    '--output', 'json', '--output-path', out,
    '--chrome-flags', '--headless=new --no-sandbox --disable-gpu',
    '--chrome-path', CHROME,
    '--only-categories=performance,accessibility,best-practices,seo',
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
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('fail ' + c))));
  });
  const lhr = JSON.parse(fs.readFileSync(out, 'utf8'));
  const a = lhr.audits;
  const n = (k) => (a[k] && typeof a[k].numericValue === 'number' ? Math.round(a[k].numericValue) : null);
  console.log(
    ROUTE.padEnd(22),
    'Perf', Math.round(lhr.categories.performance.score * 100),
    'A11y', Math.round(lhr.categories.accessibility.score * 100),
    'BP', Math.round(lhr.categories['best-practices'].score * 100),
    'SEO', Math.round(lhr.categories.seo.score * 100),
    '| FCP', n('first-contentful-paint'),
    'LCP', n('largest-contentful-paint'),
    'CLS', a['cumulative-layout-shift'] ? a['cumulative-layout-shift'].numericValue.toFixed(3) : '?',
    'TBT', n('total-blocking-time')
  );
  const lcpPhases = (a['largest-contentful-paint-element']?.details?.items || [])[1];
  if (lcpPhases) for (const p of lcpPhases.items) console.log('   ', p.phase, Math.round(p.timing) + 'ms', p.percent);
  const opp = Object.entries(a).filter(([, x]) => x.details?.type === 'opportunity' && x.details.overallSavingsMs > 0);
  for (const [id, x] of opp) console.log('    OPP', id, Math.round(x.details.overallSavingsMs) + 'ms');
  fs.unlinkSync(out);
})().catch((e) => { console.error(e); process.exit(1); });
