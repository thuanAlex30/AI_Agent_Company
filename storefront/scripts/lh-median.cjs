// scripts/lh-median.cjs — Do Lighthouse N LAN cho moi route va lay TRUNG VI.
// Do mot lan duoc nhieu nhieu lan do khac nhau (nhieu Chrome/background process),
// nen dung median de so sanh cac bien the.
//   node scripts/lh-median.cjs [runs] [baseUrl]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RUNS = Number(process.argv[2] || 3);
const BASE = process.argv[3] || 'http://127.0.0.1:4173';
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/san-pham', name: 'Catalog' },
  { path: '/san-pham/ca-phe-sua', name: 'Detail' },
  { path: '/thanh-toan', name: 'Checkout' },
];

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

async function runLighthouse(url) {
  const out = path.join(require('os').tmpdir(), 'lh-m-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
  const args = [
    path.join(ROOT, 'node_modules', 'lighthouse', 'cli', 'index.js'),
    url,
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
    p.on('close', (c) => (c === 0 ? res() : rej(new Error('lh exit ' + c))));
  });
  const lhr = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.unlinkSync(out);
  const a = lhr.audits;
  const n = (k) => (a[k] && typeof a[k].numericValue === 'number' ? Math.round(a[k].numericValue) : 0);
  return {
    perf: Math.round(lhr.categories.performance.score * 100),
    a11y: Math.round(lhr.categories.accessibility.score * 100),
    bp: Math.round(lhr.categories['best-practices'].score * 100),
    seo: Math.round(lhr.categories.seo.score * 100),
    LCP: n('largest-contentful-paint'),
    FCP: n('first-contentful-paint'),
    CLS: a['cumulative-layout-shift'] ? a['cumulative-layout-shift'].numericValue : 0,
    TBT: n('total-blocking-time'),
  };
}

(async () => {
  const rows = [];
  for (const r of ROUTES) {
    const acc = { perf: [], a11y: [], bp: [], seo: [], LCP: [], FCP: [], CLS: [], TBT: [] };
    for (let i = 0; i < RUNS; i++) {
      try {
        const res = await runLighthouse(BASE + r.path);
        for (const k of Object.keys(acc)) acc[k].push(res[k]);
      } catch (e) {
        console.error(r.name + ' run ' + (i + 1) + ' loi: ' + e.message);
      }
    }
    const row = { name: r.name, path: r.path };
    for (const k of Object.keys(acc)) row[k] = acc[k].length ? median(acc[k]) : 0;
    rows.push(row);
    console.log(
      r.name.padEnd(10) + ' Perf ' + String(row.perf).padStart(3) +
      ' A11y ' + String(row.a11y).padStart(3) +
      ' BP ' + String(row.bp).padStart(3) +
      ' SEO ' + String(row.seo).padStart(3) +
      ' | FCP ' + String(row.FCP).padStart(5) +
      ' LCP ' + String(row.LCP).padStart(5) +
      ' CLS ' + row.CLS.toFixed(3) +
      ' TBT ' + String(row.TBT).padStart(4) +
      '  [LCP tap ' + acc.LCP.join(',') + ']'
    );
  }

  const bad = rows.filter(
    (r) => r.perf < 90 || r.a11y < 95 || r.bp < 95 || r.seo < 90 || r.LCP > 2500 || r.CLS > 0.1 || r.TBT > 200
  );
  console.log('\nKET QUA (median ' + RUNS + ' lan): ' + (bad.length ? 'FAIL -> ' + bad.map((b) => b.name + '(LCP ' + b.LCP + ')').join(', ') : 'PASS'));
  fs.writeFileSync(path.join(ROOT, 'lighthouse-report.json'), JSON.stringify(rows, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
