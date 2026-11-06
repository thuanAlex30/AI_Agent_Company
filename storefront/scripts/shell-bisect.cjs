// scripts/shell-bisect.cjs — Tim thuoc gay "Layout 600ms cho 51 DOM node".
// Do Layout duration cua STATIC SHELL (JS chan) khi cat tung phan CSS.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const CSS = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const BODY = raw.match(/<body[\s\S]*?<\/body>/i)[0].replace(/<script[\s\S]*?<\/script>/gi, '');

function variant(name, css) {
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>${BODY}</html>`;
}

const VARIANTS = {
  'baseline': CSS,
  'no-art': CSS.replace(/\.art-[a-z]+:after\{[^}]*\}/g, '').replace(/\.hero \.imgbox:after\{[^}]*\}/g, ''),
  'no-fontface': CSS.replace(/@font-face\{[^}]*\}/g, ''),
  'no-keyframes': CSS.replace(/@keyframes[^}]*\{[^}]*\}[^}]*\}/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ''),
  'no-media': CSS.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ''),
  'only-reset': CSS.split('@font-face')[0],
  'no-smooth': CSS.replace(/scroll-behavior:smooth/g, ''),
  'no-safeb': CSS.replace(/env\(safe-area-inset-bottom,0px\)/g, '0px').replace(/env\(safe-area-inset-bottom, ?0px\)/g, '0px'),
  'no-overflowx': CSS.replace(/overflow-x:hidden/g, ''),
  'no-hero-imgbox': CSS.replace(/\.hero \.imgbox\{[^}]*\}/g, ''),
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
  await new Promise((s) => setTimeout(s, 500));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = {
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    count: m.LayoutCount,
    nodes: m.Nodes,
  };
  await page.close();
  return r;
}
function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const ROUNDS = Number(process.argv[2] || 5);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const names = Object.keys(VARIANTS);
  const acc = {};
  names.forEach((n) => (acc[n] = { layout: [], style: [], count: [] }));
  for (let i = 0; i < ROUNDS; i++) {
    for (const n of names) {
      const r = await once(browser, variant(n, VARIANTS[n]));
      acc[n].layout.push(r.layout);
      acc[n].style.push(r.style);
      acc[n].count.push(r.count);
    }
  }
  console.log('=== SHELL CSS BISECT (median ' + ROUNDS + ') ===');
  for (const n of names) {
    console.log(
      n.padEnd(16) + ' Layout ' + String(median(acc[n].layout)).padStart(5) +
      'ms  Style ' + String(median(acc[n].style)).padStart(5) +
      'ms  LayoutCount ' + median(acc[n].count)
    );
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
