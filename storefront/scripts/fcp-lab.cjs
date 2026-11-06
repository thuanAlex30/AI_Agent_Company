// scripts/fcp-lab.cjs — Truyen hien FCP/LCP bi GIU boi gi. A/B cac bien:
//   base | no-fonts | no-preload-font | font-display-block | font-display-swap
//   | no-shell | only-shell | no-css-inline | font-swap-block
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 7);

const VARIANTS = {
  base: (html) => html,
  'no-fonts': (html) => html.replace(/<link rel="preload" as="font"[^>]*>/g, ''),
  'font-display-block': (html) => html.replace(/font-display:\s*optional/g, 'font-display:block'),
  'font-display-swap': (html) => html.replace(/font-display:\s*optional/g, 'font-display:swap'),
  'no-font-face': (html) => html.replace(/@font-face\s*\{[^}]*\}/g, ''),
  'no-shell': (html) => html.replace(/<div id="root">[\s\S]*?<\/div>\s*<!--[\s\S]*?-->/, '<div id="root"></div>'),
  'no-inherit': (html) => html.replace(/font-family:\s*var\(--font\)/g, 'font-family:system-ui'),
  'no-fallback-face': (html) => html.replace(/@font-face\s*\{[^}]*BVP Fallback[^}]*\}/g, ''),
};

async function run(variant, blockFontRequests) {
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
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    try {
      if (req.resourceType() === 'document') {
        const raw = await (await fetch(BASE + ROUTE)).text();
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: VARIANTS[variant](raw) });
      } else if (blockFontRequests && /\.woff2?(\?|$)/i.test(req.url())) {
        await req.abort();
      } else {
        await req.continue();
      }
    } catch (e) { try { await req.continue(); } catch (e2) {} }
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2200));
  const r = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const fp = performance.getEntriesByName('first-paint')[0];
    let lcp = null;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = e; }).observe({ type: 'largest-contentful-paint', buffered: true });
    const lt = performance.getEntriesByType('longtask').map((e) => Math.round(e.duration));
    let cls = 0;
    for (const e of performance.getEntriesByType('layout-shift')) if (!e.hadRecentInput) cls += e.value;
    return {
      fp: fp ? Math.round(fp.startTime) : -1,
      fcp: fcp ? Math.round(fcp.startTime) : -1,
      lcp: lcp ? Math.round(lcp.startTime) : -1,
      tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
      cls,
      nodes: document.querySelectorAll('*').length,
    };
  });
  await browser.close();
  return r;
}

(async () => {
  const variants = Object.keys(VARIANTS);
  const acc = {};
  for (const v of variants) acc[v] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of variants) acc[v].push(await run(v, false));
  }
  const med = (a, k) => { const x = a.map((r) => r[k]).sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
  console.log(`=== FCP LAB x${ROUNDS} on ${ROUTE} ===`);
  for (const v of variants) {
    const a = acc[v];
    console.log(
      `${v.padEnd(20)} FP=${String(med(a, 'fp')).padStart(5)} FCP=${String(med(a, 'fcp')).padStart(5)} ` +
      `LCP=${String(med(a, 'lcp')).padStart(5)} TBT=${String(med(a, 'tbt')).padStart(5)} CLS=${Number(med(a, 'cls')).toFixed(3)} nodes=${med(a, 'nodes')}`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
