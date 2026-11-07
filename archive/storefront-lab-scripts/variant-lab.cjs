// scripts/variant-lab.cjs — Do A/B tren server THAT bang cach intercept response va patch.
// Bien: none | no-emoji | no-intl | emoji-svg | both | no-css-emoji-img
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';

const NO_EMOJI_CSS = `.hero .imgbox::after{content:none!important}
.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{content:none!important}`;

const EMOJI_SVG_CSS = `.hero .imgbox::after{content:''!important;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='%23c98b5e'/%3E%3C/svg%3E") center/40% no-repeat!important}
.art-cafe::after,.art-tra::after,.art-banh::after,.art-combo::after{content:''!important;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='%23d9a066'/%3E%3C/svg%3E") center/50% no-repeat!important}`;

const VARIANTS = {
  none: (html, js) => ({ html, js }),
  'no-emoji': (html) => ({ html: html.replace('</style>', NO_EMOJI_CSS + '</style>') }),
  'emoji-svg': (html) => ({ html: html.replace('</style>', EMOJI_SVG_CSS + '</style>') }),
  // Tan 1 formatter ra module-level (khong tao moi moi lan render)
  'cached-intl': (html, js) => ({
    js: js
      .replace(/\.toLocaleString\("vi-VN"\)/g, '__VND__.format')
      .replace(/__VND__/g, 'window.__VND__'),
    html: html.replace('</head>', '<script>window.__VND__=new Intl.NumberFormat("vi-VN")</script></head>'),
  }),
  // Bien: bo hoan toan bo viec format -> kiem tra app co render hay khong
  'broken-check': (html, js) => ({ js: js.replace(/\.toLocaleString\("vi-VN"\)/g, '(void 0)') }),
};

async function run(variant) {
  const patch = VARIANTS[variant];
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
  page.on('request', async (r) => {
    try {
      const res = await r.respond({
        status: 200,
        contentType: r.resourceType() === 'script' ? 'text/javascript' : 'text/html',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: '',
      });
    } catch (e) { /* ignore */ }
  });
  await browser.close();
}

async function runVariant(variant, rounds) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const acc = [];
  for (let i = 0; i < rounds; i++) {
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
      const url = req.url();
      try {
        if (req.resourceType() === 'document') {
          const raw = await (await fetch(url)).text();
          let out = { html: raw, js: null };
          const p = VARIANTS[variant];
          out = p(out.html, out.js);
          await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: out.html });
        } else if (req.resourceType() === 'script') {
          const raw = await (await fetch(url)).text();
          const p = VARIANTS[variant];
          const out = p(null, raw);
          const body = out.js !== null && out.js !== undefined ? out.js : raw;
          await req.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body });
        } else {
          await req.continue();
        }
      } catch (e) {
        try { await req.continue(); } catch (e2) {}
      }
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
      h1: (document.querySelector('h1') || {}).textContent || '',
      err: !!document.querySelector('vite-error-overlay'),
    }));
    acc.push({
      task: Math.round(m.TaskDuration * 1000),
      script: Math.round(m.ScriptDuration * 1000),
      layout: Math.round(m.LayoutDuration * 1000),
      style: Math.round(m.RecalcStyleDuration * 1000),
      layouts: m.LayoutCount,
      tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
      maxlt: Math.max(0, ...lt),
      dom,
    });
    await page.close();
  }
  await browser.close();
  const med = (k) => { const v = acc.map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const doms = acc.map((x) => x.dom.nodes).sort((a, b) => a - b);
  const cards = acc.map((x) => x.dom.cards).sort((a, b) => a - b);
  return {
    task: med('task'), script: med('script'), layout: med('layout'), style: med('style'),
    layouts: med('layouts'), tbt: med('tbt'), maxlt: med('maxlt'),
    nodes: doms[Math.floor(doms.length / 2)], cards: cards[Math.floor(cards.length / 2)],
    h1: acc[0].dom.h1, err: acc.some((x) => x.dom.err),
  };
}

(async () => {
  const ROUNDS = 5;
  const names = process.argv[4] ? process.argv[4].split(',') : Object.keys(VARIANTS);
  for (const v of names) {
    const r = await runVariant(v, ROUNDS);
    console.log(
      `${v.padEnd(12)} Task=${String(r.task).padStart(6)} Script=${String(r.script).padStart(5)} Layout=${String(r.layout).padStart(5)} ` +
      `Style=${String(r.style).padStart(4)} layouts=${String(r.layouts).padStart(3)} TBT=${String(r.tbt).padStart(5)}ms maxLT=${String(r.maxlt).padStart(4)}ms ` +
      `nodes=${String(r.nodes).padStart(4)} cards=${String(r.cards).padStart(3)} err=${r.err} h1="${(r.h1 || '').slice(0, 20)}"`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
