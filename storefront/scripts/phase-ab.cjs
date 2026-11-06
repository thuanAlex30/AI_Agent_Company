// scripts/phase-ab.cjs — Tach 2 pha: (1) shell parse+layout, (2) React mount.
// Bien: base | no-react (chi shell, khong mount React) | react-only (khong shell)
//
// Cach do: thay the <script type="module" src="index.js"> bang noi dung tuy bien,
// nhung GIU NGUYEN cac file asset -> moi so sanh duoc.
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 7);

let RAW = null;

function variant(v) {
  if (v === 'base') return RAW;
  if (v === 'no-react') {
    // Giu shell + CSS, BO module script -> khong React, khong route-chunk
    return RAW
      .replace(/<script type="module" crossorigin src="\/assets\/index-[^"]+"><\/script>/, '')
      .replace(/<script type="module">[\s\S]*?<\/script>/, '');
  }
  if (v === 'no-shell') {
    // Bo shell, giu React
    return RAW
      .replace(/<div id="root">[\s\S]*?<\/div>\s*<!--[\s\S]*?-->/, '<div id="root"></div>')
      .replace(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/, '');
  }
  return RAW;
}

async function run(v) {
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
        if (!RAW) RAW = await (await fetch(BASE + ROUTE)).text();
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: variant(v) });
      } else {
        await req.continue();
      }
    } catch (e) { try { await req.continue(); } catch (e2) {} }
  });
  await page.evaluateOnNewDocument(() => {
    window.__lt = []; window.__lcp = []; window.__cls = 0; window.__fcp = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push({ t: Math.round(e.startTime), el: e.element ? e.element.tagName + '.' + String(e.element.className || '').slice(0, 20) : '' }); }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true });
    } catch (e) {}
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2200));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = await page.evaluate(() => ({
    fcp: window.__fcp,
    lcp: window.__lcp.length ? window.__lcp[window.__lcp.length - 1].t : -1,
    lt: window.__lt,
    tbt: window.__lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
    cls: window.__cls,
    nodes: document.querySelectorAll('*').length,
  }));
  await browser.close();
  return {
    task: Math.round(m.TaskDuration * 1000),
    script: Math.round(m.ScriptDuration * 1000),
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    layouts: m.LayoutCount,
    ...r,
  };
}

(async () => {
  const variants = ['base', 'no-react', 'no-shell'];
  const acc = {};
  for (const v of variants) acc[v] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of variants) acc[v].push(await run(v));
  }
  const med = (a, k) => { const x = a.map((r) => r[k]).sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
  console.log(`=== PHASE AB x${ROUNDS} on ${ROUTE} ===`);
  for (const v of variants) {
    const a = acc[v];
    console.log(
      `${v.padEnd(10)} FCP=${String(med(a, 'fcp')).padStart(5)} LCP=${String(med(a, 'lcp')).padStart(5)} TBT=${String(med(a, 'tbt')).padStart(5)} ` +
      `Task=${String(med(a, 'task')).padStart(5)} Script=${String(med(a, 'script')).padStart(5)} ` +
      `Layout=${String(med(a, 'layout')).padStart(5)} Style=${String(med(a, 'style')).padStart(4)} layouts=${String(med(a, 'layouts')).padStart(3)} ` +
      `CLS=${Number(med(a, 'cls')).toFixed(3)} nodes=${med(a, 'nodes')}`
    );
    console.log(`     LT: ${a[0].lt.join(',')}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
