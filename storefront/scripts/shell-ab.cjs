// scripts/shell-ab.cjs — A/B tren server THAT: co shell vs bo shell (va bien khac).
// Observer longtask/LCP/CLS duoc DANG KY TRUOC navigation (evaluateOnNewDocument)
// -> do chinh xac (khong bo loi longtask nao).
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 7);

const V = {
  base: (h) => h,
  'no-shell': (h) => h
    .replace(/<div id="root">[\s\S]*?<\/div>\s*<!--[\s\S]*?-->/, '<div id="root"></div>')
    .replace(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/, ''),
  'no-topbar-header-nav': (h) => h
    .replace(/<div class="topbar">[\s\S]*?<\/div>\s*<\/div>/, '')
    .replace(/<header class="header">[\s\S]*?<\/header>/, '')
    .replace(/<nav class="nav"[\s\S]*?<\/nav>/, ''),
  'minimal-shell': (h) => h
    .replace(/<div id="root">[\s\S]*?<\/div>\s*<!--[\s\S]*?-->/,
      '<div id="root"><main class="wrap" id="main"><h1 class="page-h1">Thực đơn</h1></main></div>')
    .replace(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/, ''),
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
        const raw = await (await fetch(BASE + ROUTE)).text();
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: V[variant](raw) });
      } else {
        await req.continue();
      }
    } catch (e) { try { await req.continue(); } catch (e2) {} }
  });
  await page.evaluateOnNewDocument(() => {
    window.__lt = [];
    window.__lcp = [];
    window.__cls = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp.push({ t: Math.round(e.startTime), el: e.element ? e.element.tagName + '.' + String(e.element.className || '').slice(0, 22) : '' }); }).observe({ type: 'largest-contentful-paint', buffered: true });
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
      lcpList: window.__lcp,
      tbt: window.__lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
      lt: window.__lt,
      cls: window.__cls,
      nodes: document.querySelectorAll('*').length,
      h1: ((document.querySelector('h1') || {}).textContent || '').slice(0, 18),
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
  console.log(`=== SHELL AB x${ROUNDS} on ${ROUTE} ===`);
  for (const v of variants) {
    const a = acc[v];
    console.log(
      `${v.padEnd(24)} FCP=${String(med(a, 'fcp')).padStart(5)} LCP=${String(med(a, 'lcp')).padStart(5)} ` +
      `TBT=${String(med(a, 'tbt')).padStart(5)} CLS=${Number(med(a, 'cls')).toFixed(3)} nodes=${String(med(a, 'nodes')).padStart(4)} h1="${med(a, 'h1')}"`
    );
    console.log(`    LT: ${a[0].lt.join(',')}  LCP: ${a[0].lcpList.map((x) => x.t + '/' + x.el).join(' ')}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
