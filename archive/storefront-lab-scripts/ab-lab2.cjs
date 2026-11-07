// scripts/ab-lab2.cjs — A/B tren server THAT voi CSS patch, xen ke, nhieu vong.
// Do them TBT + LCP + CLS de tranh "fix" lam LCP/CLS vo.
// Usage: node scripts/ab-lab2.cjs <base> <route> <variants csv> [rounds]
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const NAMES = (process.argv[4] || 'none').split(',');
const ROUNDS = Number(process.argv[5] || 7);

const PATCHES = {
  'none': {},
  'cv-card': { css: '.pcard{content-visibility:auto!important;contain-intrinsic-size:auto 400px!important}' },
  'cv-grid': { css: '.grid{content-visibility:auto!important;contain-intrinsic-size:auto 1200px!important}' },
  'cv-both': { css: '.pcard{content-visibility:auto!important;contain-intrinsic-size:auto 400px!important}.grid{content-visibility:auto!important;contain-intrinsic-size:auto 1200px!important}' },
  'fixed-grid': { css: '.grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.grid.g3{grid-template-columns:repeat(2,minmax(0,1fr))!important}' },
  'no-aspect': { css: '.pimg{aspect-ratio:auto!important;height:150px!important}.dimg{aspect-ratio:auto!important;height:160px!important}' },
  'no-shadow-all': { css: '*{box-shadow:none!important}' },
  'contain-all': { css: '.pcard,.card,.ui-btn,.ui-badge,.banner{contain:layout paint style!important}' },
  'willchange': { css: '.pcard{will-change:contents!important}' },
};

async function runOne(variant) {
  const p = PATCHES[variant] || {};
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
        const body = p.css ? raw.replace('</style>', p.css + '</style>') : raw;
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
    setTimeout(() => res(last ? { t: Math.round(last.startTime), tag: last.element ? last.element.tagName + '.' + (last.element.className || '') : '' } : null), 100);
  }));
  const cls = await page.evaluate(() => new Promise((res) => {
    let v = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => res(v), 100);
  }));
  const dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    cards: document.querySelectorAll('.pcard').length,
    h1: (document.querySelector('h1') || {}).textContent || '',
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
    lcp: lcp ? lcp.t : null,
    lcpTag: lcp ? lcp.tag : '',
    cls,
    dom,
  };
}

(async () => {
  const acc = {};
  for (const n of NAMES) acc[n] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const n of NAMES) acc[n].push(await runOne(n));
  }
  const med = (arr, k) => { const v = arr.map((x) => x[k]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : '-'; };
  console.log(`=== A/B2 interleaved x${ROUNDS} on ${ROUTE} ===`);
  const base = med(acc[NAMES[0]], 'tbt');
  for (const n of NAMES) {
    const a = acc[n];
    const tbt = med(a, 'tbt');
    console.log(
      `${n.padEnd(14)} TBT=${String(tbt).padStart(5)}ms (d=${tbt - base >= 0 ? '+' : ''}${tbt - base}) ` +
      `maxLT=${String(med(a, 'maxlt')).padStart(4)} Task=${String(med(a, 'task')).padStart(5)} Script=${String(med(a, 'script')).padStart(5)} ` +
      `Layout=${String(med(a, 'layout')).padStart(5)} Style=${String(med(a, 'style')).padStart(4)} ` +
      `LCP=${String(med(a, 'lcp')).padStart(5)} CLS=${med(a, 'cls').toFixed(3)} nodes=${med(a, 'dom').nodes} cards=${med(a, 'dom').cards}`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
