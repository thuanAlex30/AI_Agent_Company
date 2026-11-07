// scripts/css-lab3.cjs — Do layout/style tren STATIC SHELL, co CPU throttle 4x + mang Slow 4G,
// xen ke (interleaved) N vong, lay median. Muc dich: tim nguyen nhan layout dat "pathological".
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

const mk = (extra) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preload" as="font" type="font/woff2" href="/fonts/be-vietnam-pro-vietnamese-700-normal.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fonts/be-vietnam-pro-latin-700-normal.woff2" crossorigin>
<style>${CSS}${extra || ''}</style></head><body>${SHELL}</body></html>`;

const cases = {
  'base': '',
  'no-emoji': ".hero .imgbox:after{content:none!important}",
  'emoji-ascii': ".hero .imgbox:after{content:'AB'!important}",
  'no-imgbox': '.hero .imgbox{display:none!important}',
  'no-fallback-face': "@font-face{font-family:'BVP Fallback';src:local('Arial');font-weight:400 500;size-adjust:93.53%;ascent-override:100%;descent-override:26.5%}@font-face{font-family:'BVP Fallback';src:local('Arial');font-weight:600 700 800 900;size-adjust:113.92%;ascent-override:100%;descent-override:26.5%}",
  'no-fallback-face2': ':root{--font:"Be Vietnam Pro",system-ui,sans-serif!important}',
  'no-webfont-at-all': ':root{--font:system-ui,sans-serif!important}@font-face{font-family:"Be Vietnam Pro";src:local("Arial")}',
  'no-aspect': '.pimg{aspect-ratio:auto!important}.dimg{aspect-ratio:auto!important}',
  'no-grad-hero': '.hero{background:#6F4E37!important}',
  'no-shadow': '*{box-shadow:none!important}',
  'no-transition': '*{transition:none!important}',
  'no-overflow-hidden': 'body{overflow-x:visible!important}',
  'no-sticky': '.header{position:static!important}',
  'no-nav-scroll': '.nav .wrap{overflow-x:visible!important}.chip-row{overflow-x:visible!important}',
  'no-smooth': 'html{scroll-behavior:auto!important}',
  'trim-css': '/*x*/',
};

async function once(browser, pageHtml) {
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
  await page.setContent(pageHtml, { waitUntil: 'load' });
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
  const only = process.argv[3] ? process.argv[3].split(',') : null;
  const names = only || Object.keys(cases);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const acc = {};
  for (const k of names) acc[k] = { layout: [], style: [], task: [] };
  for (let i = 0; i < ROUNDS; i++) {
    for (const name of names) {
      const r = await once(browser, mk(cases[name]));
      acc[name].layout.push(r.layout);
      acc[name].style.push(r.style);
      acc[name].task.push(r.task);
    }
  }
  await browser.close();
  console.log(`=== CSS LAB 3 (CPU 4x, Slow 4G, interleaved x${ROUNDS}) ===`);
  const base = median(acc[names[0]].layout);
  for (const k of names) {
    const l = median(acc[k].layout);
    const s = median(acc[k].style);
    const t = median(acc[k].task);
    const d = k === names[0] ? '' : `  dLayout=${l - base >= 0 ? '+' : ''}${l - base}ms`;
    console.log(`${k.padEnd(20)} Layout=${String(l).padStart(5)}ms Style=${String(s).padStart(4)}ms Task=${String(t).padStart(5)}ms${d}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
