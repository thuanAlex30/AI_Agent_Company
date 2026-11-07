// scripts/font-swap-lab.cjs — Kiem do font-swap (webfont -> fallback) gay full style+layout.
// Do tren trang THAT, xen ke (interleaved), nhieu vong, lay median.
// Bien: base | no-preload | block-fonts | sync-font | no-swap-preload-only
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 7);

async function once(variant) {
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

  if (variant === 'block-fonts') {
    await page.setRequestInterception(true);
    page.on('request', (r) => (/\.woff2?(\?|$)/i.test(r.url()) ? r.abort() : r.continue()));
  }
  await page.setRequestInterception(true);
  const origHandler = null;
  page.on('request', async (req) => {
    if (variant === 'no-preload' && req.resourceType() === 'document') {
      try {
        const raw = await (await fetch(BASE + ROUTE)).text();
        const body = raw.replace(/<link rel="preload" as="font"[^>]*>/g, '');
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
        return;
      } catch (e) { /* fallthrough */ }
    }
    if (variant === 'swap-opt' && req.resourceType() === 'document') {
      try {
        const raw = await (await fetch(BASE + ROUTE)).text();
        // font-display: optional -> NEON bao gio doi font (neu font chua den trong 100ms)
        const body = raw.replace(/font-display:optional/g, 'font-display:optional');
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
        return;
      } catch (e) { /* fallthrough */ }
    }
    try { await req.continue(); } catch (e) {}
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
  const fonts = await page.evaluate(() => {
    const f = [...document.fonts].map((x) => x.family + ':' + x.weight + ':' + x.status);
    return { n: document.fonts.size, list: f.slice(0, 8), used: (document.fonts.check ? document.fonts.check('700 16px "Be Vietnam Pro"') : null) };
  });
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
    layouts: m.LayoutCount,
    tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
    maxlt: Math.max(0, ...lt),
    fonts, dom,
  };
}

(async () => {
  const variants = ['base', 'no-preload', 'block-fonts'];
  const acc = {};
  for (const v of variants) acc[v] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of variants) acc[v].push(await once(v));
  }
  const med = (a, k) => { const x = a.map((r) => r[k]).sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
  console.log(`=== FONT-SWAP LAB x${ROUNDS} on ${ROUTE} ===`);
  for (const v of variants) {
    const a = acc[v];
    console.log(
      `${v.padEnd(13)} Task=${String(med(a, 'task')).padStart(6)} Script=${String(med(a, 'script')).padStart(5)} ` +
      `Layout=${String(med(a, 'layout')).padStart(5)} Style=${String(med(a, 'style')).padStart(4)} layouts=${String(med(a, 'layouts')).padStart(3)} ` +
      `TBT=${String(med(a, 'tbt')).padStart(5)} maxLT=${String(med(a, 'maxlt')).padStart(4)} fontsUsed=${a[0].fonts.used} nodes=${med(a, 'dom').nodes}`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
