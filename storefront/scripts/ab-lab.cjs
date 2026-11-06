// scripts/ab-lab.cjs — A/B tren server THAT, xen ke (interleaved) de loai nhieu do doc.
// Moi lan: 1 bien -> 1 page moi -> do Task/Script/Layout/Style/TBT + kiem tra DOM render that.
// Usage: node scripts/ab-lab.cjs <base> <route> <variants csv> [rounds]
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const NAMES = (process.argv[4] || 'none').split(',');
const ROUNDS = Number(process.argv[5] || 7);

// Patch CSS (them vao </style> cua index.html inline) va patch JS bundle.
const PATCHES = {
  'none': {},
  'no-aspect': { css: '.pimg{aspect-ratio:auto!important}.dimg{aspect-ratio:auto!important}' },
  'no-autofill': { css: '.grid{grid-template-columns:repeat(2,1fr)!important}.grid.g3{grid-template-columns:repeat(2,1fr)!important}' },
  'no-emoji': { css: '.hero .imgbox::after{content:none!important}.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{content:none!important}' },
  'no-imgbox': { css: '.hero .imgbox{display:none!important}' },
  'no-card-trans': { css: '.pcard{transition:none!important}.quick a{transition:none!important}' },
  'contain-grid': { css: '.grid{contain:layout style!important}' },
  'no-shadow': { css: '*{box-shadow:none!important}' },
};

function patchHtml(raw, css) {
  if (!css) return raw;
  return raw.replace('</style>', css + '</style>');
}

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
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: patchHtml(raw, p.css) });
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
    nodes: dom.nodes, cards: dom.cards,
  };
}

(async () => {
  const acc = {};
  for (const n of NAMES) acc[n] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const n of NAMES) acc[n].push(await runOne(n));
  }
  const med = (arr, k) => { const v = arr.map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  console.log(`=== A/B interleaved x${ROUNDS} on ${ROUTE} ===`);
  const base = med(acc[NAMES[0]], 'layout');
  for (const n of NAMES) {
    const a = acc[n];
    console.log(
      `${n.padEnd(14)} Task=${String(med(a, 'task')).padStart(6)} Script=${String(med(a, 'script')).padStart(5)} ` +
      `Layout=${String(med(a, 'layout')).padStart(5)} Style=${String(med(a, 'style')).padStart(4)} layouts=${String(med(a, 'layouts')).padStart(3)} ` +
      `TBT=${String(med(a, 'tbt')).padStart(5)} maxLT=${String(med(a, 'maxlt')).padStart(4)} ` +
      `nodes=${String(med(a, 'nodes')).padStart(4)} cards=${med(a, 'cards')} dLayout=${med(a, 'layout') - base}`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
