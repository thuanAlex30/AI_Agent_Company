// scripts/timeline.cjs — Timeline that tu Performance API cua trinh duyet (khong suy doan).
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
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));

  const out = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource').map((r) => ({
      name: r.name.split('/').slice(-1)[0],
      type: r.initiatorType,
      start: Math.round(r.startTime),
      end: Math.round(r.responseEnd),
      dur: Math.round(r.responseEnd - r.startTime),
    })).sort((a, b) => a.start - b.start);
    const paints = performance.getEntriesByType('paint').map((p) => ({ n: p.name, t: Math.round(p.startTime) }));
    const lcpList = performance.getEntriesByType('largest-contentful-paint').map((e) => ({
      t: Math.round(e.startTime),
      tag: e.element ? e.element.tagName + '.' + String(e.element.className || '').slice(0, 24) : '',
    }));
    const longtasks = performance.getEntriesByType('longtask').map((e) => ({
      t: Math.round(e.startTime), d: Math.round(e.duration),
    }));
    let shifts = 0;
    const cls = performance.getEntriesByType('layout-shift').filter((e) => !e.hadRecentInput);
    for (const s of cls) shifts += s.value;
    return {
      nav: {
        ttfb: Math.round(nav.responseStart), domInteractive: Math.round(nav.domInteractive),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd),
      },
      paints, lcp: lcpList.slice(-3), longtasks, cls: shifts, res,
    };
  });
  await browser.close();

  console.log('=== NAVIGATION ===', JSON.stringify(out.nav));
  console.log('=== PAINTS ===', JSON.stringify(out.paints));
  console.log('=== LCP ===', JSON.stringify(out.lcp));
  console.log('=== CLS ===', out.cls.toFixed(3));
  console.log('=== LONG TASKS ===');
  for (const t of out.longtasks.sort((a, b) => b.d - a.d)) console.log(`  ${String(t.d).padStart(5)}ms @${String(t.t).padStart(5)}ms`);
  console.log('=== RESOURCES ===');
  for (const r of out.res) console.log(`  ${String(r.start).padStart(5)} -> ${String(r.end).padStart(5)} (${String(r.dur).padStart(5)}ms) ${r.type.padEnd(10)} ${r.name}`);
})().catch((e) => { console.error(e); process.exit(1); });
