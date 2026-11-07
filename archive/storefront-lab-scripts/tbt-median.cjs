// scripts/tbt-median.cjs — Do TBT/LCP nhanh, lap lai N lan, lay median.
// Dung CDP throttling (CPU 4x + network Slow 4G) + PerformanceObserver longtask.
// Nhanh hon Lighthouse ~10x, dung de A/B so sanh bien the.
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTES = (process.argv[3] || '/,/san-pham,/san-pham/ca-phe-sua,/thanh-toan').split(',');
const RUNS = Number(process.argv[4] || 5);

async function run(browser, route) {
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
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lt.push({ s: e.startTime, d: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) {}
    window.__cls = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}
  });
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 4000));
  const out = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint');
    const fcp = p.find((x) => x.name === 'first-contentful-paint');
    const lcpList = performance.getEntriesByType('largest-contentful-paint');
    const lcp = lcpList.length ? lcpList[lcpList.length - 1].startTime : -1;
    const fcpT = fcp ? fcp.startTime : 0;
    let tbt = 0;
    const tasks = window.__lt.map((x) => ({ s: x.s, d: x.d })).sort((a, b) => a.s - b.s);
    for (const t of tasks) {
      if (t.s + t.d <= fcpT) continue;          // truoc FCP -> khong tinh TBT
      if (t.s > fcpT + 15000) break;
      tbt += Math.max(0, t.d - 50);
    }
    return {
      fcp: Math.round(fcpT), lcp: Math.round(lcp), tbt: Math.round(tbt),
      cls: +window.__cls.toFixed(4),
      tasks: tasks.map((t) => Math.round(t.d)),
      n: tasks.length,
    };
  });
  await page.close();
  return out;
}
function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (const route of ROUTES) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) rs.push(await run(browser, route));
    const med = (k) => median(rs.map((r) => r[k]));
    console.log(
      route.padEnd(24) +
      ' FCP ' + String(med('fcp')).padStart(5) +
      ' LCP ' + String(med('lcp')).padStart(5) +
      ' TBT ' + String(med('tbt')).padStart(5) +
      ' CLS ' + med('cls').toFixed(4) +
      '  tasks ' + med('n') +
      '  TBT tap: ' + rs.map((r) => r.tbt).join(',')
    );
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
