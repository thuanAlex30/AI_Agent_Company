// scripts/lh-ab.cjs — So sanh 2 server bang Lighthouse (simulate) tren 1 route.
// Dung khi can so sanh 2 BUILD khac nhau voi nhau (nhieu nhieu lan do).
//   node scripts/lh-ab.cjs <urlA> <urlB> <route> [runs]
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const URL_A = process.argv[2] || 'http://127.0.0.1:4173';
const URL_B = process.argv[3] || 'http://127.0.0.1:4174';
const ROUTE = process.argv[4] || '/san-pham';
const RUNS = Number(process.argv[5] || 3);
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function runLighthouse(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), 'lh-ab-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
    const args = [
      path.join(ROOT, 'node_modules', 'lighthouse', 'cli', 'index.js'),
      url, '--output', 'json', '--output-path', out,
      '--chrome-flags', '--headless=new --no-sandbox --disable-gpu',
      '--chrome-path', CHROME,
      '--only-categories=performance',
      '--form-factor=mobile', '--screenEmulation.mobile',
      '--screenEmulation.width=390', '--screenEmulation.height=844',
      '--screenEmulation.deviceScaleFactor=2',
      '--throttling-method=simulate', '--throttling.rttMs=150',
      '--throttling.throughputKbps=1638.4', '--throttling.cpuSlowdownMultiplier=4',
      '--quiet',
    ];
    const p = spawn(process.execPath, args, { shell: false });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(out)) return reject(new Error('lh fail: ' + err.slice(-200)));
      try { resolve(JSON.parse(fs.readFileSync(out, 'utf8'))); } catch (e) { reject(e); }
      finally { try { fs.unlinkSync(out); } catch {} }
    });
  });
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

(async () => {
  const acc = { A: { perf: [], LCP: [], FCP: [], TBT: [], CLS: [], SI: [] }, B: { perf: [], LCP: [], FCP: [], TBT: [], CLS: [], SI: [] } };
  for (let i = 0; i < RUNS; i++) {
    for (const [k, u] of [['A', URL_A], ['B', URL_B]]) {
      try {
        const lhr = await runLighthouse(u + ROUTE);
        const a = lhr.audits;
        const n = (x) => (a[x] && typeof a[x].numericValue === 'number' ? Math.round(a[x].numericValue) : 0);
        acc[k].perf.push(Math.round(lhr.categories.performance.score * 100));
        acc[k].LCP.push(n('largest-contentful-paint'));
        acc[k].FCP.push(n('first-contentful-paint'));
        acc[k].TBT.push(n('total-blocking-time'));
        acc[k].CLS.push(a['cumulative-layout-shift'].numericValue);
        acc[k].SI.push(n('speed-index'));
      } catch (e) { console.error(k + ' loi: ' + e.message); }
    }
  }
  console.log(`=== LH A/B x${RUNS} on ${ROUTE} ===`);
  for (const k of ['A', 'B']) {
    const x = acc[k];
    const url = k === 'A' ? URL_A : URL_B;
    console.log(
      `${k} ${url.padEnd(30)} Perf=${String(med(x.perf)).padStart(3)} FCP=${String(med(x.FCP)).padStart(5)} ` +
      `LCP=${String(med(x.LCP)).padStart(5)} TBT=${String(med(x.TBT)).padStart(5)} CLS=${med(x.CLS).toFixed(3)} SI=${String(med(x.SI)).padStart(5)}`
    );
    console.log(`     perf=[${x.perf.join(',')}] LCP=[${x.LCP.join(',')}] TBT=[${x.TBT.join(',')}]`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
