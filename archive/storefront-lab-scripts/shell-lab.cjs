// scripts/shell-lab.cjs — Cat tung phan cua STATIC SHELL, do Layout (CPU 4x, interleaved).
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

const mk = (extraCss, shellOverride) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preload" as="font" type="font/woff2" href="/fonts/be-vietnam-pro-vietnamese-700-normal.woff2" crossorigin>
<style>${CSS}${extraCss || ''}</style></head><body>${shellOverride !== undefined ? shellOverride : SHELL}</body></html>`;

// Cat phan shell bang regex don gian
const cut = {
  'base': null,
  'no-topbar': (s) => s.replace(/<div class="topbar">[\s\S]*?<\/div>\s*<\/div>/, ''),
  'no-header': (s) => s.replace(/<header class="header">[\s\S]*?<\/header>/, ''),
  'no-nav': (s) => s.replace(/<nav class="nav"[\s\S]*?<\/nav>/, ''),
  'no-hero': (s) => s.replace(/<section class="hero"[\s\S]*?<\/section>/, ''),
  'no-imgbox': (s) => s.replace(/<div class="imgbox"[^>]*\s*\/>/, ''),
  'no-skip': (s) => s.replace(/<a class="skip-link"[\s\S]*?<\/a>/, ''),
  'empty-root': () => '<div id="root"></div>',
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const acc = {};
  for (const k of Object.keys(cut)) acc[k] = { layout: [], style: [], task: [] };
  for (let i = 0; i < ROUNDS; i++) {
    for (const [name, fn] of Object.entries(cut)) {
      const shell = fn ? fn(SHELL) : SHELL;
      const r = await once(browser, mk('', shell));
      acc[name].layout.push(r.layout);
      acc[name].style.push(r.style);
      acc[name].task.push(r.task);
    }
  }
  await browser.close();
  console.log(`=== SHELL LAB (CPU 4x, interleaved x${ROUNDS}) ===`);
  const base = median(acc.base.layout);
  for (const k of Object.keys(cut)) {
    const l = median(acc[k].layout);
    const s = median(acc[k].style);
    const t = median(acc[k].task);
    const d = k === 'base' ? '' : `  dLayout=${l - base >= 0 ? '+' : ''}${l - base}ms`;
    console.log(`${k.padEnd(12)} Layout=${String(l).padStart(5)}ms Style=${String(s).padStart(4)}ms Task=${String(t).padStart(5)}ms${d}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
