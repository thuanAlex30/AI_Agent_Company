// scripts/bench.cjs — Bench nhanh (puppeteer + CDP throttle) mo phong Lighthouse:
//   Slow 4G (RTT 150ms, 1638.4kbps) + CPU 4x. Median N lan.
//   node scripts/bench.cjs [runs] [route] [baseUrl]
const puppeteer = require('puppeteer-core');

const RUNS = Number(process.argv[2] || 5);
const ROUTE = process.argv[3] || '/';
const BASE = process.argv[4] || 'http://127.0.0.1:4173';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const fcp = [];
  const lcp = [];
  const entries = [];
  for (let i = 0; i < RUNS; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const client = await page.createCDPSession();
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: (1638.4 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluateOnNewDocument(() => {
      window.__lcp = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__lcp.push({
            t: Math.round(e.startTime),
            size: e.size,
            el: e.element ? e.element.tagName + '.' + (e.element.className || '') : '?',
          });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      window.__fcp = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = Math.round(e.startTime);
      }).observe({ type: 'paint', buffered: true });
    });
    await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise((s) => setTimeout(s, 1500));
    const r = await page.evaluate(() => ({ lcp: window.__lcp, fcp: window.__fcp }));
    fcp.push(r.fcp);
    lcp.push(r.lcp.length ? r.lcp[r.lcp.length - 1].t : 0);
    if (i === 0) entries.push(...r.lcp);
    await page.close();
  }
  await browser.close();
  console.log(
    'route=' + ROUTE.padEnd(22),
    'FCP median', String(median(fcp)).padStart(5),
    '| LCP median', String(median(lcp)).padStart(5),
    '| FCP tap', fcp.join(','),
    '| LCP tap', lcp.join(',')
  );
  console.log('  LCP entries (lan 1): ' + entries.map((e) => `${e.t}ms/${e.size}/${e.el}`).join('  '));
})().catch((e) => { console.error(e); process.exit(1); });
