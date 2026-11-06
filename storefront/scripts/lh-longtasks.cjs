// scripts/lh-longtasks.cjs — Phan tich long-task cua Lighthouse theo attribution (chi tiet).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const URL_ = process.argv[2] || 'http://127.0.0.1:4173/san-pham';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function runLighthouse(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), 'lhlt-' + Date.now() + '.json');
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
      try { resolve(JSON.parse(fs.readFileSync(out, 'utf8'))); } catch (e) { reject(e); }
      finally { try { fs.unlinkSync(out); } catch {} }
    });
  });
}

(async () => {
  const lhr = await runLighthouse(URL_);
  const a = lhr.audits;
  console.log('URL:', URL_);
  console.log('Perf:', Math.round(lhr.categories.performance.score * 100),
    '| LCP', Math.round(a['largest-contentful-paint'].numericValue),
    '| FCP', Math.round(a['first-contentful-paint'].numericValue),
    '| TBT', Math.round(a['total-blocking-time'].numericValue),
    '| SI', Math.round(a['speed-index'].numericValue));

  const lt = a['long-tasks'];
  if (lt && lt.details && lt.details.items) {
    console.log('\n=== Long tasks (Lighthouse attribution) ===');
    for (const it of lt.details.items.sort((x, y) => y.duration - x.duration).slice(0, 12)) {
      const attr = it.attribution || [];
      const parts = attr.map((x) => `${x.groupLabel || x.type}=${Math.round(x.duration || 0)}ms`).join(', ');
      console.log(`  ${Math.round(it.duration)}ms @${Math.round(it.startTime)}ms url=${String(it.url || '').slice(-45)}`);
      console.log(`      ${parts}`);
    }
  }

  console.log('\n=== mainthread-work-breakdown items (raw) ===');
  const mb = a['mainthread-work-breakdown'];
  if (mb && mb.details) {
    console.log(JSON.stringify(mb.details, null, 1).slice(0, 1500));
  }

  console.log('\n=== network-requests (by resource type) ===');
  const nr = a['network-requests'];
  if (nr && nr.details && nr.details.items) {
    const byType = {};
    for (const it of nr.details.items) {
      const t = it.resourceType || 'other';
      byType[t] = (byType[t] || 0) + (it.transferSize || 0);
    }
    for (const [k, v] of Object.entries(byType).sort((x, y) => y[1] - x[1])) {
      console.log(`  ${k.padEnd(16)} ${(v / 1024).toFixed(1)} kB`);
    }
    console.log('  --- slow requests (>100ms) ---');
    for (const it of nr.details.items.filter((x) => x.networkEndTime - x.networkRequestTime > 100).sort((x, y) => (y.networkEndTime - y.networkRequestTime) - (x.networkEndTime - x.networkRequestTime)).slice(0, 10)) {
      console.log(`   ${Math.round(it.networkEndTime - it.networkRequestTime)}ms ${it.resourceType.padEnd(10)} ${String(it.url).slice(-55)}`);
    }
  }

  console.log('\n=== critical request chains / third-party ===');
  const cd = a['critical-request-chains'];
  if (cd && cd.details) console.log(JSON.stringify(cd.details).slice(0, 800));

  console.log('\n=== diagnostics hints ===');
  for (const [id, au] of Object.entries(a)) {
    if (au.details && au.details.type === 'opportunity' && au.details.overallSavingsMs > 50) {
      console.log(`  ${id}: savings=${Math.round(au.details.overallSavingsMs)}ms`);
    }
    if (au.scoreDisplayMode === 'numeric' && au.score !== null && au.score < 0.9) {
      console.log(`  ${id}: score=${au.score} value=${au.numericValue != null ? Math.round(au.numericValue) : '-'}`);
    }
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
