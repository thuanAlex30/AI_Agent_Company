// scripts/lh-tbt-detail.cjs — Doc EXACT long task nao Lighthouse dem vao TBT
// (dung bo sung 'mainthread-work-breakdown' + 'long-tasks' + bootup-time).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:4173/san-pham';

function runLighthouse(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), 'lht-' + Date.now() + '.json');
    const args = [
      path.join(__dirname, '..', 'node_modules', 'lighthouse', 'cli', 'index.js'),
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
      if (code !== 0 || !fs.existsSync(out)) return reject(new Error('lh fail: ' + err.slice(-300)));
      try { resolve(JSON.parse(fs.readFileSync(out, 'utf8'))); }
      catch (e) { reject(e); }
      finally { try { fs.unlinkSync(out); } catch {} }
    });
  });
}

(async () => {
  const lhr = await runLighthouse(URL_);
  const a = lhr.audits;
  console.log('URL:', URL_);
  console.log('Perf', Math.round(lhr.categories.performance.score * 100),
    '| FCP', Math.round(a['first-contentful-paint'].numericValue),
    '| LCP', Math.round(a['largest-contentful-paint'].numericValue),
    '| TBT', Math.round(a['total-blocking-time'].numericValue),
    '| SI', Math.round(a['speed-index'].numericValue),
    '| TTI', Math.round((a['interactive'] || { numericValue: 0 }).numericValue));

  console.log('\n=== long-tasks (raw) ===');
  const lt = a['long-tasks'];
  if (lt && lt.details && lt.details.items) {
    for (const it of lt.details.items.sort((x, y) => x.startTime - y.startTime)) {
      console.log(`  ${Math.round(it.duration)}ms @${Math.round(it.startTime)}ms url=${String(it.url || '').slice(-40)}`);
    }
  }
  console.log('\n=== bootup-time ===');
  const bt = a['bootup-time'];
  if (bt && bt.details && bt.details.items) {
    for (const it of bt.details.items) {
      console.log(`  ${Math.round(it.total)}ms  ${String(it.url || '').slice(-45)}`);
    }
  }
  console.log('\n=== mainthread-work-breakdown ===');
  const mb = a['mainthread-work-breakdown'];
  if (mb && mb.details) {
    for (const it of mb.details.items) console.log(`  ${String(Math.round(it.duration)).padStart(6)}ms  ${it.groupLabel}`);
  }
  console.log('\n=== network-requests by type ===');
  const nr = a['network-requests'];
  if (nr && nr.details) {
    const byType = {};
    for (const it of nr.details.items) {
      byType[it.resourceType] = (byType[it.resourceType] || 0) + (it.transferSize || 0);
    }
    for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${(v / 1024).toFixed(1)} kB`);
  }
  console.log('\n=== critical chains ===');
  const cc = a['critical-request-chains'];
  if (cc && cc.details) {
    console.log(JSON.stringify(cc.details).slice(0, 2000));
  }
})().catch((e) => { console.error(e); process.exit(1); });
