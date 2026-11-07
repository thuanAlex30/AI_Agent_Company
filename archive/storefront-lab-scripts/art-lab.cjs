// scripts/art-lab.cjs — Kiem do ::after co kich thuoc PHAN TRAM (%) ben trong flex/grid
// gay "intrinsic sizing" patholog (layout lai lap nhieu lan).
// Bien: base | fixed-px | aspect-ratio | no-art | width-only | height-only
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 7);

const PATCH = {
  'base': '',
  // ::after kich thuoc cung (px) -> khong can intrinsic sizing pass
  'fixed-px': `.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{width:56px!important;height:56px!important}
.hero .imgbox::after{width:110px!important;height:110px!important}`,
  // aspect-ratio thay cho width+height %
  'aspect-ratio': `.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{width:46%!important;height:auto!important;aspect-ratio:1/1!important}
.hero .imgbox::after{width:62%!important;height:auto!important;aspect-ratio:1/1!important}`,
  'no-art': '.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{content:none!important}.hero .imgbox::after{content:none!important}',
  'width-only': `.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{height:auto!important;aspect-ratio:1/1!important}
.hero .imgbox::after{height:auto!important;aspect-ratio:1/1!important}`,
  'absolute': `.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{position:absolute!important;width:46%!important;height:46%!important;inset:27%!important}
.hero .imgbox::after{position:absolute!important;width:62%!important;height:62%!important;inset:19%!important}`,
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
        const p = PATCH[v];
        const body = p ? RAW.replace('</style>', p + '</style>') : RAW;
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
      } else {
        await req.continue();
      }
    } catch (e) { try { await req.continue(); } catch (e2) {} }
  });
  await page.evaluateOnNewDocument(() => {
    window.__lt = [];
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
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
    layouts: m.LayoutCount,
    tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
    maxlt: Math.max(0, ...lt),
  };
}

const stat = (a, k, mode) => { const v = a.map((x) => x[k]).sort((p, q) => p - q); return mode === 'min' ? v[0] : v[Math.floor(v.length / 2)]; };

(async () => {
  const variants = Object.keys(PATCH);
  const acc = {};
  for (const v of variants) acc[v] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of variants) acc[v].push(await run(v));
  }
  console.log(`=== ART LAB (live, MIN+MED of ${ROUNDS}) ===`);
  for (const v of variants) {
    const a = acc[v];
    console.log(
      v.padEnd(14) +
      ' L=' + String(stat(a, 'layout', 'min')).padStart(5) + '/' + String(stat(a, 'layout', 'med')).padStart(5) +
      ' S=' + String(stat(a, 'style', 'min')).padStart(4) + '/' + String(stat(a, 'style', 'med')).padStart(4) +
      ' T=' + String(stat(a, 'task', 'min')).padStart(5) + '/' + String(stat(a, 'task', 'med')).padStart(5) +
      ' TBT=' + String(stat(a, 'tbt', 'min')).padStart(4) + '/' + String(stat(a, 'tbt', 'med')).padStart(4) +
      ' LT=' + String(stat(a, 'maxlt', 'min')).padStart(4)
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
