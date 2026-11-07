// scripts/lh-detail.cjs — Dump chit tiet audit cua Lighthouse de biet TBT den tu dau.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const URL_ = process.argv[2] || 'http://127.0.0.1:4173/san-pham';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function runLighthouse(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), 'lhdet-' + Date.now() + '.json');
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
  console.log('Perf score:', Math.round(lhr.categories.performance.score * 100));
  console.log('LCP:', Math.round(a['largest-contentful-paint'].numericValue), 'ms');
  console.log('FCP:', Math.round(a['first-contentful-paint'].numericValue), 'ms');
  console.log('TBT:', Math.round(a['total-blocking-time'].numericValue), 'ms');
  console.log('SI :', Math.round(a['speed-index'].numericValue), 'ms');
  console.log('CLS:', a['cumulative-layout-shift'].numericValue);
  console.log('TTI:', Math.round(a['interactive'].numericValue), 'ms');

  console.log('\n--- Opportunities / Diagnostics ---');
  for (const [id, au] of Object.entries(a)) {
    if (au.score !== null && au.score < 0.9 && au.details) {
      const v = au.numericValue;
      console.log(`  ${id}  score=${au.score}  value=${v != null ? Math.round(v) : '-'}`);
    }
  }

  console.log('\n--- mainthread-work-breakdown ---');
  const mb = a['mainthread-work-breakdown'];
  if (mb && mb.details && mb.details.items) {
    for (const it of mb.details.items) {
      console.log(`  ${String(it.groupLabel).padEnd(28)} ${Math.round(it.duration)}ms`);
    }
  }

  console.log('\n--- bootup-time ---');
  const bt = a['bootup-time'];
  if (bt && bt.details && bt.details.items) {
    for (const it of bt.details.items.slice(0, 12)) {
      console.log(`  ${(it.url || '').slice(-70).padEnd(70)} total=${Math.round(it.total)} script=${Math.round(it.scripting)}`);
    }
  }

  console.log('\n--- long-tasks ---');
  const lt = a['long-tasks'];
  if (lt && lt.details && lt.details.items) {
    for (const it of lt.details.items.slice(0, 20)) {
      console.log(`  ${Math.round(it.duration)}ms  ${(it.url || '').slice(-60)}  ${(it.startTime || 0).toFixed(0)}ms`);
    }
  }

  console.log('\n--- third-party / unused-javascript ---');
  const uj = a['unused-javascript'];
  if (uj && uj.details && uj.details.items) {
    for (const it of uj.details.items.slice(0, 10)) {
      console.log(`  ${(it.url || '').slice(-60).padEnd(60)} total=${Math.round(it.totalBytes / 1024)}KB wasted=${Math.round(it.wastedBytes / 1024)}KB`);
    }
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
