// scripts/route-preload-lab.cjs — Kiem do route-chunk lazy load la nguyen nhan TBT.
// Bien: base | preload-catalog | no-lazy (nhung route vao main bundle)
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 7);

const DIST = path.join(__dirname, '..', 'dist');

function routeChunk() {
  const files = fs.readdirSync(path.join(DIST, 'assets'));
  // File cua route hien tai: ten bat dau bang ten route
  const key = ROUTE.replace(/^\//, '').split('/')[0];
  const map = { 'san-pham': 'Catalog', 'thanh-toan': 'Checkout', 'gio': 'Cart', '': 'Home' };
  const want = map[key] || 'Home';
  const f = files.find((x) => x.startsWith(want + '-'));
  return f ? '/assets/' + f : null;
}

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
  await client.send('Performance.enable');
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    try {
      if (req.resourceType() === 'document') {
        const raw = await (await fetch(BASE + ROUTE)).text();
        let body = raw;
        if (variant === 'preload-catalog') {
          const chunk = routeChunk();
          if (chunk) {
            body = raw.replace('</head>', `<link rel="modulepreload" crossorigin href="${chunk}">\n</head>`);
          }
        }
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
      } else {
        await req.continue();
      }
    } catch (e) { try { await req.continue(); } catch (e2) {} }
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2200));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const lt = await page.evaluate(() => new Promise((res) => {
    const out = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) out.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
    setTimeout(() => res(out), 100);
  }));
  const lcp = await page.evaluate(() => new Promise((res) => {
    let last = null;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) last = e; }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => res(last ? Math.round(last.startTime) : -1), 100);
  }));
  const dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    cards: document.querySelectorAll('.pcard').length,
  }));
  await browser.close();
  return {
    task: Math.round(m.TaskDuration * 1000),
    script: Math.round(m.ScriptDuration * 1000),
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
    maxlt: Math.max(0, ...lt),
    lcp, dom,
  };
}

(async () => {
  const variants = ['base', 'preload-catalog'];
  const acc = { base: [], 'preload-catalog': [] };
  console.log('route chunk:', routeChunk());
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of variants) acc[v].push(await run(v));
  }
  const med = (a, k) => { const v = a.map((x) => x[k]).sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
  console.log(`=== ROUTE PRELOAD LAB x${ROUNDS} on ${ROUTE} ===`);
  for (const v of variants) {
    const a = acc[v];
    console.log(
      `${v.padEnd(18)} TBT=${String(med(a, 'tbt')).padStart(5)}ms maxLT=${String(med(a, 'maxlt')).padStart(4)} ` +
      `Task=${String(med(a, 'task')).padStart(5)} Script=${String(med(a, 'script')).padStart(5)} ` +
      `Layout=${String(med(a, 'layout')).padStart(5)} Style=${String(med(a, 'style')).padStart(4)} ` +
      `LCP=${String(med(a, 'lcp')).padStart(5)} nodes=${med(a, 'dom').nodes} cards=${med(a, 'dom').cards}`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
