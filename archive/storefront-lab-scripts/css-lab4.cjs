// scripts/css-lab4.cjs — Do layout tren shell + catalog giong luc, CPU 4x, interleaved.
// Moi bien = 1 thay doi CSS cuc bo. Muc dich: tim cau hinh CSS re nang nhat.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIST = path.join(__dirname, '..', 'dist', 'index.html');
const raw = fs.readFileSync(DIST, 'utf8');
const styleM = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/);
const CSS = styleM[1];

function card(i) {
  return `<article class="card pcard"><div class="pimg art-cafe"></div><div class="pbody">
  <h2 class="pcard-h"><a href="#">San pham mau so ${i}</a></h2>
  <span class="ui-price ui-price-md"><span class="ui-price-now">${10000 + i * 1000}đ</span></span>
  <div><span class="ui-badge bd-ok">Con hang</span></div>
  <div class="row"><button class="ui-btn ui-btn-sm btn-primary">Them gio</button></div>
  </div></article>`;
}

const mk = (extraCss, nCards) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}${extraCss || ''}</style></head><body>
<div class="topbar"><div class="wrap"><span>Hotline</span></div></div>
<header class="header"><div class="wrap"><span class="logo">BizOps</span></div></header>
<nav class="nav"><div class="wrap"><a href="#">Menu</a></div></nav>
<main class="wrap" id="main">
<h1 class="page-h1">Thuuc don</h1>
<div class="catalog-layout"><aside class="catalog-filters"><div class="card"><h2 class="ck-h">Tim mon</h2></div></aside>
<div><div class="grid">${Array.from({ length: nCards }, (_, i) => card(i)).join('')}</div></div></div>
</main></body></html>`;

const cases = {
  'base': '',
  'no-transition': '*{transition:none!important}',
  'no-shadow': '*{box-shadow:none!important}',
  'no-both': '*{transition:none!important;box-shadow:none!important}',
  'no-hover-transform': '.pcard:hover,.quick a:hover,.banner:hover{transform:none!important}',
  'no-outline': '*:focus-visible{outline:none!important}',
  'no-radius': '*{border-radius:0!important}',
  'no-grid-autofill': '.grid{grid-template-columns:repeat(2,1fr)!important}',
  'no-aspect': '.pimg{aspect-ratio:auto!important;height:160px!important}',
  'no-overflow-hidden': '*{overflow:visible!important}',
  'no-emoji': '.art-cafe:after{content:none!important}',
  'contain-body': 'body{contain:layout!important}',
  'contain-main': 'main.wrap{contain:layout!important}',
  'no-sticky': '.header{position:static!important}',
  'no-fixed-mobile': '.mobile-nav{display:none!important}',
};

async function once(browser, html) {
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
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise((s) => setTimeout(s, 400));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = { layout: Math.round(m.LayoutDuration * 1000), style: Math.round(m.RecalcStyleDuration * 1000), task: Math.round(m.TaskDuration * 1000) };
  await page.close();
  return r;
}

function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const ROUNDS = Number(process.argv[2] || 7);
  const NC = Number(process.argv[3] || 12);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const names = Object.keys(cases);
  const acc = {};
  for (const k of names) acc[k] = { layout: [], style: [], task: [] };
  for (let i = 0; i < ROUNDS; i++) {
    for (const name of names) {
      const r = await once(browser, mk(cases[name], NC));
      acc[name].layout.push(r.layout);
      acc[name].style.push(r.style);
      acc[name].task.push(r.task);
    }
  }
  await browser.close();
  console.log(`=== CSS LAB 4 (${NC} cards, CPU 4x, interleaved x${ROUNDS}) ===`);
  const base = median(acc.base.layout);
  for (const k of names) {
    const l = median(acc[k].layout);
    const s = median(acc[k].style);
    const t = median(acc[k].task);
    const d = k === 'base' ? '' : `  dLayout=${l - base >= 0 ? '+' : ''}${l - base}ms`;
    console.log(`${k.padEnd(20)} Layout=${String(l).padStart(5)}ms Style=${String(s).padStart(4)}ms Task=${String(t).padStart(5)}ms${d}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
