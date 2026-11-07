// scripts/css-lab.cjs — To hop co che layout: do lai N lan, lay median, bien CSS/OS la bien tham so.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIST = path.join(__dirname, '..', 'dist', 'index.html');
const raw = fs.readFileSync(DIST, 'utf8');
const styleM = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/);
const CSS = styleM[1];
const shellM = raw.match(/<body[^>]*>([\s\S]*?)<script>/);
const SHELL = shellM[1];

const html = (css, extraCss) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}${extraCss || ''}</style></head><body>${SHELL}</body></html>`;

// Cac bien: CSS goc + shell goc
const cases = {
  'base': '',
  'no-overflow-x': 'body{overflow-x:visible!important}',
  'no-sticky': '.header{position:static!important}',
  'no-nav-scroll': '.nav .wrap{overflow-x:visible!important}',
  'no-hero-grid': '.hero{grid-template-columns:1fr!important}',
  'no-emoji': '.hero .imgbox:after{content:none!important}',
  'no-search': '.search{display:none!important}',
  'no-transition': '*{transition:none!important}',
  'no-animation': '*{animation:none!important}',
  'no-boxshadow': '*{box-shadow:none!important}',
  'no-gradient': '.hero{background:#6F4E37!important}',
  'no-smooth': 'html{scroll-behavior:auto!important}',
  'no-nowrap': '.nav a{white-space:normal!important}',
  // --- vong 2: khoang cach rieng ---
  'emoji-ascii': ".hero .imgbox:after{content:'XX'!important}",
  'no-imgbox': '.hero .imgbox{display:none!important}',
  'no-art-emoji': '.art-cafe:after,.art-tra:after,.art-banh:after,.art-combo:after{content:none!important}',
  'no-fallback-font': ':root{--font:system-ui,sans-serif!important}',
  'no-imgbox-minh': '.hero .imgbox{min-height:0!important}',
  'no-topbar': '.topbar{display:none!important}',
  'no-nav': '.nav{display:none!important}',
  'no-header': '.header{display:none!important}',
  'no-cta': '.cta{display:none!important}',
};

async function measure(pageHtml, n) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const out = [];
  for (let i = 0; i < n; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const client = await page.createCDPSession();
    await client.send('Performance.enable');
    await page.setContent(pageHtml, { waitUntil: 'load' });
    await new Promise((s) => setTimeout(s, 400));
    const { metrics } = await client.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    out.push({ layout: Math.round(m.LayoutDuration * 1000), style: Math.round(m.RecalcStyleDuration * 1000), task: Math.round(m.TaskDuration * 1000) });
    await page.close();
  }
  await browser.close();
  return out;
}

function median(a, k) { const v = a.map((x) => x[k]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const N = 5;
  const only = process.argv[2];
  for (const [name, extra] of Object.entries(cases)) {
    if (only && only !== name) continue;
    const r = await measure(html(CSS, extra), N);
    console.log(
      `${name.padEnd(16)} Layout=${String(median(r, 'layout')).padStart(5)}ms  Style=${String(median(r, 'style')).padStart(4)}ms  Task=${String(median(r, 'task')).padStart(5)}ms`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
