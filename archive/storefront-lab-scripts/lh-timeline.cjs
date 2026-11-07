// scripts/lh-timeline.cjs — Lay timeline that (Lighthouse trace) va tim task 774ms "Unattributable".
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const URL_ = process.argv[2] || 'http://127.0.0.1:4173/san-pham';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function runLighthouse(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(os.tmpdir(), 'lhraw-' + Date.now() + '.json');
    const args = [
      path.join(__dirname, '..', 'node_modules', 'lighthouse', 'cli', 'index.js'),
      url, '--output', 'json', '--output-path', out,
      '--chrome-flags', '--headless=new --no-sandbox --disable-gpu',
      '--chrome-path', CHROME,
      '--only-categories=performance', '--save-assets',
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
    });
  });
}

(async () => {
  const lhr = await runLighthouse(URL_);
  const tracePath = (lhr.audits['metrics'] && lhr.audits['metrics'].details) ? null : null;
  const assets = lhr.assets || {};
  console.log('Perf:', Math.round(lhr.categories.performance.score * 100));
  console.log('Assets keys:', Object.keys(assets));
  const trace = assets['trace'];
  if (!trace) { console.log('KHONG co trace asset'); return; }
  const raw = typeof trace.data === 'string' ? trace.data : JSON.stringify(trace);
  fs.writeFileSync(path.join(os.tmpdir(), 'lh-trace.json'), raw);
  console.log('trace saved ->', path.join(os.tmpdir(), 'lh-trace.json'), raw.length, 'bytes');
})().catch((e) => { console.error(e.message); process.exit(1); });
