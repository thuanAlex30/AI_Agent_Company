// scripts/lh-audit.cjs — Chay Lighthouse 1 route va in TAT CA audit bi fail (score<1)
// Giup tim nguyen nhan A11y / BP / SEO khong dat + phan tich TBT.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function runLighthouse(url) {
  return new Promise((resolve, reject) => {
    const out = path.join(require('os').tmpdir(), 'lh-' + Date.now() + '.json');
    const args = [
      path.join(__dirname, '..', 'node_modules', 'lighthouse', 'cli', 'index.js'),
      url, '--output', 'json', '--output-path', out,
      '--chrome-flags', '--headless=new --no-sandbox --disable-gpu',
      '--chrome-path', CHROME,
      '--only-categories=accessibility,best-practices,seo,performance',
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
    const p = spawn(process.execNode || process.execPath, args, { shell: false });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(out)) return reject(new Error('lh fail: ' + err.slice(-400)));
      try { resolve(JSON.parse(fs.readFileSync(out, 'utf8'))); } catch (e) { reject(e); }
      finally { try { fs.unlinkSync(out); } catch {} }
    });
  });
}

function items(audit) {
  const d = audit && audit.details;
  if (!d) return [];
  if (Array.isArray(d.items)) return d.items;
  if (d.items && typeof d.items === 'object') return Object.values(d.items).flat();
  return [];
}

(async () => {
  const lhr = await runLighthouse(BASE + ROUTE);
  const a = lhr.audits;
  console.log('=== ' + ROUTE + ' ===');
  for (const [cat, c] of Object.entries(lhr.categories)) {
    console.log(`  ${cat}: ${Math.round(c.score * 100)}`);
  }
  console.log('--- AUDIT FAIL (score < 1) ---');
  const fails = Object.values(a).filter(
    (x) => x.score !== null && x.score < 1 && !['informative', 'notApplicable', 'manual', 'metricSavings'].includes(x.scoreDisplayMode)
  );
  for (const f of fails) {
    console.log(`\n[${f.id}] score=${f.score} (${f.scoreDisplayMode})`);
    console.log('  title: ' + f.title);
    if (f.explanation) console.log('  explain: ' + f.explanation.replace(/\s+/g, ' ').slice(0, 400));
    for (const it of items(f).slice(0, 8)) {
      const node = it.node || {};
      console.log('  item: ' + String(node.selector || node.snippet || JSON.stringify(it)).replace(/\s+/g, ' ').slice(0, 300));
    }
  }
  console.log('\n--- METRICS ---');
  for (const k of ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'interactive', 'speed-index', 'max-potential-fid']) {
    if (a[k]) console.log(`  ${k}: ${a[k].numericValue} (${a[k].displayValue})`);
  }
  console.log('\n--- LONG TASKS ---');
  for (const it of items(a['long-tasks']).slice(0, 20)) {
    console.log(`  ${Math.round(it.duration)}ms  ${String(it.url).slice(0, 110)}`);
  }
  console.log('\n--- BOOTUP (main thread JS) ---');
  for (const it of items(a['bootup-time']).slice(0, 15)) {
    console.log(`  ${Math.round(it.total)}ms  ${String(it.url).slice(0, 110)}`);
  }
  console.log('\n--- MAINTHREAD BREAKDOWN ---');
  for (const it of items(a['mainthread-work-breakdown'])) {
    console.log(`  ${it.groupLabel}: ${Math.round(it.duration)}ms`);
  }
  console.log('\n--- NETWORK PAYLOAD ---');
  for (const it of items(a['network-requests']).slice(0, 25)) {
    console.log(`  ${String(it.resourceType).padEnd(10)} ${Math.round(it.transferSize / 1024)}kB  ${String(it.url).slice(0, 100)}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
