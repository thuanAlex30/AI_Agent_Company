// scripts/css-lab5.cjs — Do layout tren STATIC SHELL voi thong ke MIN (it nhieu do doc
// nhieu nhat) + interleaved. Shell = 49 node -> do duoc 1000ms layout = bat thuong.
//
// Cach do: server that, tra HTML da patch (CSS them vao </style>).
// Bien: base | no-shimmer | no-sticky | no-overflow-x | no-smooth | no-transition
//      | no-shadow | no-aspect | no-webfont | no-fallback-face | no-hero-imgbox
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 9);

const CSS_PATCH = {
  'base': '',
  'no-shimmer': '.ui-skel::after{animation:none!important}',
  'no-sticky': '.header{position:static!important}',
  'no-overflow-x': 'body{overflow-x:visible!important}',
  'no-smooth': 'html{scroll-behavior:auto!important}',
  'no-transition': '*{transition:none!important}',
  'no-shadow': '*{box-shadow:none!important}',
  'no-aspect': '.pimg{aspect-ratio:auto!important;height:150px!important}',
  'no-webfont': ':root{--font:system-ui,sans-serif!important}',
  'no-fallback-face': '@font-face{font-family:"BVP Fallback";src:local("Arial")}',
  'no-hero-imgbox': '.hero .imgbox{display:none!important}',
  'no-art': '.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{content:none!important}',
  'no-grid': '.grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}',
  'no-minheight': 'main.wrap{min-height:0!important}',
};

let RAW = null;

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
        const patch = CSS_PATCH[v];
        const body = patch ? RAW.replace('</style>', patch + '</style>') : RAW;
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
      } else {
        await req.continue();
      }
    } catch (e) { try { await req.continue(); } catch (e2) {} }
  });
  await page.evaluateOnNewDocument(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
    } catch (e) {}
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2000));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const lt = await page.evaluate(() => window.__lt);
  await browser.close();
  return {
    task: Math.round(m.TaskDuration * 1000),
    script: Math.round(m.ScriptDuration * 1000),
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
    maxlt: Math.max(0, ...lt),
  };
}

const stat = (a, k, mode) => {
  const v = a.map((x) => x[k]).sort((p, q) => p - q);
  return mode === 'min' ? v[0] : v[Math.floor(v.length / 2)];
};

(async () => {
  const variants = process.env.VARIANTS ? process.env.VARIANTS.split(',') : Object.keys(CSS_PATCH);
  const acc = {};
  for (const v of variants) acc[v] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of variants) acc[v].push(await run(v));
  }
  console.log(`=== CSS LAB 5 (live server, MIN of ${ROUNDS}, CPU 4x) ===`);  console.log('variant'.padEnd(20) + 'Layout(min)  Layout(med)  Style(min)  Task(min)  TBT(min)  maxLT(min)');
  for (const v of variants) {
    const a = acc[v];
    console.log(
      v.padEnd(20) +
      String(stat(a, 'layout', 'min')).padStart(8) + 'ms' +
      String(stat(a, 'layout', 'med')).padStart(12) + 'ms' +
      String(stat(a, 'style', 'min')).padStart(10) + 'ms' +
      String(stat(a, 'task', 'min')).padStart(10) + 'ms' +
      String(stat(a, 'tbt', 'min')).padStart(9) + 'ms' +
      String(stat(a, 'maxlt', 'min')).padStart(10) + 'ms'
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
