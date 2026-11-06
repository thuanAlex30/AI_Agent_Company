// scripts/cv-cls-lab.cjs — Do CLS + LCP cho cac bien the content-visibility (trang that).
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/';

const RULES = {
  'none': '',
  'cv-reveal': '.reveal { content-visibility: auto; contain-intrinsic-size: auto 600px; }',
  'cv-below': 'main.wrap > .quick, main.wrap > .grid, main.wrap > .sechd, main.wrap > .reveal, main.wrap > .card, main.wrap > nav.banners { content-visibility: auto; contain-intrinsic-size: auto 500px; }',
};

async function run(browser, css) {
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
    window.__cls = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}
  });
  if (css) {
    await page.evaluateOnNewDocument((c) => {
      const s = document.createElement('style');
      s.textContent = c;
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }, css);
  }
  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 3500));
  // Scroll to bottom to trigger any content-visibility reveal
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    window.scrollTo(0, 0);
  });
  await new Promise((s) => setTimeout(s, 800));
  const out = await page.evaluate(() => {
    const lcp = performance.getEntriesByType('largest-contentful-paint');
    const p = performance.getEntriesByType('paint');
    return {
      cls: window.__cls,
      lcp: lcp.length ? Math.round(lcp[lcp.length - 1].startTime) : -1,
      fcp: p.length ? Math.round(p[0].startTime) : -1,
    };
  });
  await page.close();
  return out;
}

(async () => {
  const R = Number(process.argv[4] || 3);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (const [name, css] of Object.entries(RULES)) {
    const rs = [];
    for (let i = 0; i < R; i++) rs.push(await run(browser, css));
    const med = (k) => { const v = rs.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    console.log(name.padEnd(12) + ' CLS ' + med('cls').toFixed(4) + '  FCP ' + med('fcp') + '  LCP ' + med('lcp') + '   CLS all: ' + rs.map((r) => r.cls.toFixed(3)).join(','));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
