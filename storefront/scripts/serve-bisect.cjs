// scripts/serve-bisect.cjs — Bisect CSS tren TRANG SERVE THAT (co font that, co shell script).
// Do Performance.getMetrics sau khi load that voi JS bi chan.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const CSS = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];

const VARIANTS = {
  'baseline': (c) => c,
  'no-art': (c) => c.replace(/\.art-[a-z]+:after\{[^}]*\}/g, '').replace(/\.hero \.imgbox:after\{[^}]*\}/g, ''),
  'no-fontface': (c) => c.replace(/@font-face\{[^}]*\}/g, ''),
  'no-shadow': (c) => c.replace(/box-shadow:[^;}]*/g, '').replace(/--shadow-[0-9]:[^;]*/g, ''),
  'no-transition': (c) => c.replace(/transition:[^;}]*/g, ''),
  'no-animation': (c) => c.replace(/animation:[^;}]*/g, ''),
  'no-clamp': (c) => c.replace(/clamp\(2rem, ?4vw \+ 1rem, ?3\.25rem\)/g, '2.2rem'),
  'no-sticky': (c) => c.replace(/position:sticky/g, 'position:static'),
  'no-grid-hero': (c) => c.replace(/\.hero\{[^}]*\}/g, ''),
  'no-fixed': (c) => c.replace(/position:fixed/g, 'position:static'),
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
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.url().endsWith('.js')) r.abort();
    else r.continue();
  });
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise((s) => setTimeout(s, 2500));
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
  const R = Number(process.argv[2] || 5);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const names = Object.keys(VARIANTS);
  const acc = {};
  names.forEach((n) => (acc[n] = { layout: [], style: [], count: [] }));
  for (let i = 0; i < R; i++) {
    for (const n of names) {
      const css = VARIANTS[n](CSS);
      const html = raw.replace(/<style[^>]*>[\s\S]*?<\/style>/, '<style>' + css + '</style>');
      const r = await once(browser, html);
      acc[n].layout.push(r.layout);
      acc[n].style.push(r.style);
      acc[n].count.push(r.count);
    }
  }
  console.log('=== SERVE BISECT (median ' + R + ', JS blocked) ===');
  for (const n of names) {
    console.log(n.padEnd(14) + ' Layout ' + String(median(acc[n].layout)).padStart(5) +
      'ms  Style ' + String(median(acc[n].style)).padStart(5) + 'ms  count ' + median(acc[n].count));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
