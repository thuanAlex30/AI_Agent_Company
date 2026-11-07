// scripts/diag-layout.cjs — Do chi phi Layout cua STATIC SHELL (JS bi chan)
// vs toan trang (React chay). Tach rieng CSS bat bien vao layout.
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

  const events = [];
  client.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await client.send('Tracing.start', {
    traceConfig: { includedCategories: ['devtools.timeline'], recordMode: 'recordAsMuchAsPossible' },
  });

  // CHAN JS: requestInterception -> abort moi .js
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.url().endsWith('.js')) r.abort();
    else r.continue();
  });

  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 1500));
  const done = new Promise((res) => client.once('Tracing.tracingComplete', res));
  await client.send('Tracing.end');
  await done;

  const t0 = Math.min(...events.map((e) => e.ts).filter(Boolean));
  console.log('=== SHELL ONLY (JS blocked) ' + ROUTE + ' ===');
  const agg = new Map();
  for (const e of events) {
    if (!e.dur) continue;
    agg.set(e.name, (agg.get(e.name) || 0) + e.dur);
  }
  for (const [n, d] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log('  ' + String(Math.round(d / 1000)).padStart(6) + 'ms  ' + n);
  }
  console.log('--- events > 50ms ---');
  for (const e of events.filter((x) => x.dur > 50000).sort((a, b) => b.dur - a.dur).slice(0, 12)) {
    console.log(`  t=${Math.round((e.ts - t0) / 1000)}ms ${Math.round(e.dur / 1000)}ms ${e.name}`);
  }
  const dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    height: document.documentElement.scrollHeight,
  }));
  console.log('  DOM nodes: ' + dom.nodes + '  page height: ' + dom.height);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
