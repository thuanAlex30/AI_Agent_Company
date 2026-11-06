// scripts/lighthouse.cjs — Do Lighthouse mobile (Slow 4G, CPU 4x slowdown) cho tung trang.
//   node scripts/lighthouse.cjs [baseUrl]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/san-pham', name: 'Catalog' },
  { path: '/san-pham/ca-phe-sua', name: 'Detail' },
  { path: '/thanh-toan', name: 'Checkout' },
];

const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

function runLighthouse(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(require('os').tmpdir(), 'lh-' + Date.now() + '.json');
    const args = [
      path.join(__dirname, '..', 'node_modules', 'lighthouse', 'cli', 'index.js'),
      url,
      '--output', 'json', '--output-path', out,
      '--chrome-flags', '--headless=new --no-sandbox --disable-gpu',
      '--chrome-path', CHROME,
      '--only-categories=' + CATEGORIES.join(','),
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
    const p = spawn(process.execPath, args, { shell: false });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(out)) return reject(new Error('lh fail: ' + err.slice(-400)));
      try { resolve(JSON.parse(fs.readFileSync(out, 'utf8'))); } catch (e) { reject(e); }
      finally { try { fs.unlinkSync(out); } catch {} }
    });
  });
}

(async () => {
  const rows = [];
  for (const r of ROUTES) {
    process.stdout.write('Dang do ' + r.name + ' ... ');
    try {
      const lhr = await runLighthouse(BASE + r.path);
      const s = lhr.categories;
      const a = lhr.audits;
      const num = (k) => (a[k] && typeof a[k].numericValue === 'number' ? a[k].numericValue : null);
      rows.push({
        name: r.name,
        path: r.path,
        perf: Math.round(s.performance.score * 100),
        a11y: Math.round(s.accessibility.score * 100),
        bp: Math.round(s['best-practices'].score * 100),
        seo: Math.round(s.seo.score * 100),
        LCP: num('largest-contentful-paint'),
        CLS: num('cumulative-layout-shift'),
        TBT: num('total-blocking-time'),
      });
      console.log('xong');
    } catch (e) {
      console.log('LOI: ' + e.message);
      rows.push({ name: r.name, path: r.path, error: e.message });
    }
  }

  console.log('\n=== LIGHTHOUSE MOBILE (Slow 4G, CPU 4x) ===');
  console.log('Trang      Perf  A11y  BP   SEO   LCP(s)  CLS    TBT(ms)');
  for (const r of rows) {
    if (r.error) { console.log(r.name.padEnd(10) + ' ERROR ' + r.error); continue; }
    console.log(
      r.name.padEnd(10)
      + String(r.perf).padStart(4) + '  ' + String(r.a11y).padStart(4) + '  '
      + String(r.bp).padStart(3) + '  ' + String(r.seo).padStart(3) + '  '
      + (r.LCP != null ? (r.LCP / 1000).toFixed(2) : '?').padStart(6) + '  '
      + (r.CLS != null ? r.CLS.toFixed(3) : '?').padStart(6) + '  '
      + (r.TBT != null ? Math.round(r.TBT) : '?').toString().padStart(6)
    );
  }

  const bad = rows.filter((r) => !r.error && (r.perf < 90 || r.a11y < 95 || r.bp < 95 || r.seo < 90 || (r.LCP && r.LCP > 2500) || (r.CLS && r.CLS > 0.1) || (r.TBT && r.TBT > 200)));
  console.log('\nLIGHTHOUSE: ' + (bad.length ? 'FAIL (' + bad.map((b) => b.name).join(', ') + ')' : 'PASS'));
  fs.writeFileSync(path.join(__dirname, '..', 'lighthouse-report.json'), JSON.stringify(rows, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
