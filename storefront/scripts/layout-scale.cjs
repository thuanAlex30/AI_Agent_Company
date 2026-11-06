// scripts/layout-scale.cjs — Do layout cost voi so luong the san pham (0/4/12/24/48).
// Neu tang TUYEN TINH -> layout re nang (nhieu DOM).
// Neu CONSTANT -> co layout loop / pathology.
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

const mk = (n, extraCss) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}${extraCss || ''}</style></head><body>
<div class="topbar"><div class="wrap"><span>Hotline</span></div></div>
<header class="header"><div class="wrap"><span class="logo">BizOps</span></div></header>
<nav class="nav"><div class="wrap"><a href="#">Menu</a></div></nav>
<main class="wrap" id="main">
<h1 class="page-h1">Thuuc don</h1>
<div class="catalog-layout"><aside class="catalog-filters"><div class="card"><h2 class="ck-h">Tim mon</h2></div></aside>
<div><div class="grid">${Array.from({ length: n }, (_, i) => card(i)).join('')}</div></div></div>
</main></body></html>`;

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
  const r = {
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    layouts: m.LayoutCount,
    nodes: m.Nodes,
  };
  await page.close();
  return r;
}

function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const ROUNDS = Number(process.argv[2] || 7);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const counts = [0, 4, 12, 24, 48];
  const acc = {};
  for (const n of counts) acc[n] = { layout: [], style: [], nodes: [], layouts: [] };
  for (let i = 0; i < ROUNDS; i++) {
    for (const n of counts) {
      const r = await once(browser, mk(n));
      acc[n].layout.push(r.layout);
      acc[n].style.push(r.style);
      acc[n].nodes.push(r.nodes);
      acc[n].layouts.push(r.layouts);
    }
  }
  await browser.close();
  console.log(`=== LAYOUT SCALE (CPU 4x, interleaved x${ROUNDS}) ===`);
  for (const n of counts) {
    const a = acc[n];
    console.log(
      `cards=${String(n).padStart(3)} nodes=${String(median(a.nodes)).padStart(4)} ` +
      `Layout=${String(median(a.layout)).padStart(5)}ms Style=${String(median(a.style)).padStart(4)}ms layouts=${median(a.layouts || [])}`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
