// scripts/profile-tbt.cjs — CPU profile + longtask attribution cho route.
// Dung CDP Profiler de biet task dai dang gi (React render? JSON.parse? style?).
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/thanh-toan';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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

  await page.evaluateOnNewDocument(() => {
    window.__lt = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration), name: e.name });
    }).observe({ type: 'longtask', buffered: true });
  });

  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 100 });
  await client.send('Profiler.start');
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const { profile } = await client.send('Profiler.stop');

  // Tom tat self time theo function
  const nodes = new Map();
  for (const n of profile.nodes) nodes.set(n.id, n);
  const self = new Map();
  const dt = (profile.endTime - profile.startTime) / 1000;
  for (const id of profile.samples) {
    const n = nodes.get(id);
    if (!n) continue;
    const f = n.callFrame;
    const key = (f.functionName || '(anon)') + ' @ ' + String(f.url || '').split('/').pop() + ':' + f.lineNumber;
    self.set(key, (self.get(key) || 0) + 1);
  }
  const total = profile.samples.length;
  console.log('=== CPU PROFILE ' + ROUTE + ' (4x throttle) ===');
  console.log('  wall=' + Math.round(dt) + 'ms  samples=' + total);
  const sorted = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  for (const [k, v] of sorted) {
    console.log(`  ${String(Math.round((v / total) * dt)).padStart(5)}ms  ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
  }

  const lt = await page.evaluate(() => window.__lt);
  console.log('\n--- LONG TASKS (>50ms) ---');
  for (const e of lt) console.log(`  t=${String(e.t).padStart(6)}ms dur=${String(e.d).padStart(5)}ms`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
