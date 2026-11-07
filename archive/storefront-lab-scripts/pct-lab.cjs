// scripts/pct-lab.cjs — Kiem chung: % height tren pseudo-element trong flex container
// co tao vong lap intrinsic-sizing (nhieu layout pass) khong?
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const CSS = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const BODY = raw.match(/<body[\s\S]*?<\/body>/i)[0].replace(/<script[\s\S]*?<\/script>/gi, '');

const ART_BLOCK = /\.art-[a-z]+:after\{[^}]*\}\.art-[a-z]+:after\{[^}]*\}/;
const HERO_ART = /\.hero \.imgbox:after\{[^}]*\}/;

function replaceAllBlocks(css, re, fn) {
  return css.replace(new RegExp(re.source, 'g'), (m) => fn(m));
}

const VARIANTS = {
  'baseline': CSS,
  'art-fixed': replaceAllBlocks(CSS, /\.art-[a-z]+:after\{[^}]*\}/g, (m) =>
    m.replace(/width:[^;}]+/, 'width:96px').replace(/height:[^;}]+/, 'height:96px')),
  'art-aspect': replaceAllBlocks(CSS, /\.art-[a-z]+:after\{[^}]*\}/g, (m) =>
    m.replace(/width:[^;}]+/, 'width:46%').replace(/height:[^;}]+/, 'aspect-ratio:1/1;height:auto')),
  'hero-fixed': CSS.replace(HERO_ART, (m) => m.replace(/width:[^;}]+/, 'width:120px').replace(/height:[^;}]+/, 'height:120px')),
  'hero-aspect': CSS.replace(HERO_ART, (m) => m.replace(/width:[^;}]+/, 'width:62%').replace(/height:[^;}]+/, 'aspect-ratio:1/1;height:auto')),
  'all-fixed': replaceAllBlocks(CSS, /\.art-[a-z]+:after\{[^}]*\}/g, (m) =>
    m.replace(/width:[^;}]+/, 'width:96px').replace(/height:[^;}]+/, 'height:96px'))
    .replace(HERO_ART, (m) => m.replace(/width:[^;}]+/, 'width:120px').replace(/height:[^;}]+/, 'height:120px')),
  'all-aspect': replaceAllBlocks(CSS, /\.art-[a-z]+:after\{[^}]*\}/g, (m) =>
    m.replace(/width:[^;}]+/, 'width:46%').replace(/height:[^;}]+/, 'aspect-ratio:1/1;height:auto'))
    .replace(HERO_ART, (m) => m.replace(/width:[^;}]+/, 'width:62%').replace(/height:[^;}]+/, 'aspect-ratio:1/1;height:auto')),
};

async function once(browser, css) {
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
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>${BODY}</html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise((s) => setTimeout(s, 900));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = {
    layout: Math.round(m.LayoutDuration * 1000),
    layoutCount: m.LayoutCount,
    style: Math.round(m.RecalcStyleDuration * 1000),
    styleCount: m.RecalcStyleCount,
  };
  await page.close();
  return r;
}
function stat(a) { const v = [...a].sort((x, y) => x - y); return { min: v[0], med: v[Math.floor(v.length / 2)] }; }

(async () => {
  const R = Number(process.argv[2] || 7);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  console.log('=== PCT HEIGHT LAB (shell, median ' + R + ') ===');
  for (const [name, css] of Object.entries(VARIANTS)) {
    const acc = { layout: [], layoutCount: [], style: [], styleCount: [] };
    for (let i = 0; i < R; i++) {
      const r = await once(browser, css);
      for (const k of Object.keys(acc)) acc[k].push(r[k]);
    }
    const L = stat(acc.layout), LC = stat(acc.layoutCount), S = stat(acc.style);
    console.log(name.padEnd(12) + ' Layout min ' + String(L.min).padStart(4) + ' med ' + String(L.med).padStart(4) +
      'ms (pass=' + LC.med + ')  Style min ' + String(S.min).padStart(4) + 'ms  tap: ' + acc.layout.join(','));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
