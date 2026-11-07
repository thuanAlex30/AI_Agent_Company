// scripts/cpu-profile.cjs — CPU profile (CDP Profiler) de ghep cay goi cho task lon.
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 200 });
  await client.send('Profiler.start');
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const { profile } = await client.send('Profiler.stop');
  await browser.close();

  // Gom theo node: total time = (hitCount * samples.length) -> su dung timeDeltas
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    const dt = profile.timeDeltas[i] || 0;
    self.set(id, (self.get(id) || 0) + dt);
  }
  const rows = [];
  for (const [id, t] of self) {
    const n = byId.get(id);
    if (!n) continue;
    const cf = n.callFrame || {};
    rows.push({ t: t / 1000, fn: cf.functionName || '(anon)', url: String(cf.url || ''), line: cf.lineNumber });
  }
  rows.sort((a, b) => b.t - a.t);
  console.log('=== Top self time (ms) ===');
  for (const r of rows.slice(0, 30)) {
    console.log(`  ${String(Math.round(r.t)).padStart(6)}ms  ${r.fn.padEnd(28)} ${r.url.slice(-60)}:${r.line}`);
  }
  const total = rows.reduce((s, r) => s + r.t, 0);
  console.log('\nTotal profiled:', Math.round(total), 'ms');

  // Tong self time theo file
  const byFile = new Map();
  for (const r of rows) {
    const k = r.url.slice(-60) || '(native)';
    byFile.set(k, (byFile.get(k) || 0) + r.t);
  }
  console.log('\n=== Self time by file ===');
  for (const [k, v] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(Math.round(v)).padStart(6)}ms  ${k}`);
  }

  // Cay goi: node cha -> tong thoi gian
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const totalTime = new Map();
  for (const n of profile.nodes) {
    let t = 0;
    let cur = n.id;
    const seen = new Set();
    while (cur !== undefined && !seen.has(cur)) {
      seen.add(cur);
      t += self.get(cur) || 0;
      cur = parent.get(cur);
    }
    totalTime.set(n.id, t);
  }
  const roots = profile.nodes.filter((n) => !parent.has(n.id));
  console.log('\n=== Root (top-level) nodes by total time ===');
  for (const n of roots) {
    const cf = n.callFrame || {};
    console.log(`  ${String(Math.round((totalTime.get(n.id) || 0) / 1000)).padStart(6)}ms  ${cf.functionName || '(root)'} ${String(cf.url || '').slice(-60)}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
