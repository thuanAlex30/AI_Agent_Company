// scripts/font-late-lab.cjs — Kiem do "font swap muon" (400-weight den sau FCP) gay
// full style-recalc + layout. A/B: base | block-400 | no-400-face | preload-400
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 7);

// Lay HTML goc 1 lan
let RAW = null;

const V = {
  base: (h) => h,
  // Bo @font-face 400 (chi con 700 -> body text dung fallback metric-compatible)
  'no-400-face': (h) => h.replace(/@font-face\s*\{[^}]*font-weight:\s*400[^}]*\}/g, ''),
  // Preload them 2 file 400
  'preload-400': (h) => h.replace('</head>',
    '<link rel="preload" as="font" type="font/woff2" href="/fonts/be-vietnam-pro-latin-400-normal.woff2" crossorigin>\n' +
    '<link rel="preload" as="font" type="font/woff2" href="/fonts/be-vietnam-pro-vietnamese-400-normal.woff2" crossorigin>\n</head>'),
};

async function run(variant) {
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
        if (!RAW) RAW = await (await fetch(BASE + ROUTE)).text();
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: V[variant](RAW) });
      } else {
        await req.continue();
      }
    } catch (e) { try { await req.continue(); } catch (e2) {} }
  });
  await page.evaluateOnNewDocument(() => {
    window.__lt = []; window.__lcp = []; window.__cls = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push({ t: Math.round(e.startTime), el: e.element ? e.element.tagName + '.' + String(e.element.className || '').slice(0, 20) : '' }); }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const r = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      fcp: fcp ? Math.round(fcp.startTime) : -1,
      lcp: window.__lcp.length ? window.__lcp[window.__lcp.length - 1].t : -1,
      tbt: window.__lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
      lt: window.__lt,
      cls: window.__cls,
      fontsLoaded: document.fonts.size,
    };
  });
  await browser.close();
  return r;
}

(async () => {
  const variants = Object.keys(V);
  const acc = {};
  for (const v of variants) acc[v] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of variants) acc[v].push(await run(v));
  }
  const med = (a, k) => { const x = a.map((r) => r[k]).sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
  console.log(`=== FONT LATE LAB x${ROUNDS} on ${ROUTE} ===`);
  for (const v of variants) {
    const a = acc[v];
    console.log(
      `${v.padEnd(16)} FCP=${String(med(a, 'fcp')).padStart(5)} LCP=${String(med(a, 'lcp')).padStart(5)} ` +
      `TBT=${String(med(a, 'tbt')).padStart(5)} CLS=${Number(med(a, 'cls')).toFixed(3)} fonts=${med(a, 'fontsLoaded')}`
    );
    console.log(`    LT: ${a[0].lt.join(',')}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
