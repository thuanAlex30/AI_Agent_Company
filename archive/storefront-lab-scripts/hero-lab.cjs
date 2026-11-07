// scripts/hero-lab.cjs — Bisect CHI PHI LAYOUT cua phan HERO (shell).
// Hero chua: grid 2 cot + imgbox flex + ::after SVG data-URI kich thuoc phan tram.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const CSS = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const BODY = raw.match(/<body[\s\S]*?<\/body>/i)[0].replace(/<script[\s\S]*?<\/script>/gi, '');

const HERO_CSS = (() => {
  const m = CSS.match(/\.hero\{[\s\S]*?\.hero \.imgbox\{[\s\S]*?\}/);
  return m ? m[0] : '';
})();
const ART = (() => {
  const m = CSS.match(/\.hero \.imgbox:after\{[^}]*\}/);
  return m ? m[0] : '';
})();

const VARIANTS = {
  'full': CSS,
  'no-hero-css': CSS.replace(HERO_CSS, ''),
  'no-hero-art': CSS.replace(ART, ''),
  'no-art-at-all': CSS.replace(/\.art-[a-z]+:after\{[^}]*\}/g, '').replace(ART, ''),
  'art-fixed-px': CSS.replace(ART, '.hero .imgbox:after{content:"";display:block;width:120px;height:120px;background:url(data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%2064%2064%27%20fill%3D%27none%27%20stroke%3D%27%23FFFFFF%27%20stroke-width%3D%271.8%27%3E%3Cpath%20d%3D%27M10%2024h32v16a10%2010%200%200%201-10%2010h-12a10%2010%200%200%201-10-10z%27%2F%3E%3C%2Fsvg%3E) center / contain no-repeat}'),
  'no-gradient': CSS.replace(/background:linear-gradient\(120deg,var\(--brand-700\),var\(--brand-500\)\)/, 'background:var(--brand-700)'),
  'imgbox-no-flex': CSS.replace(/\.hero \.imgbox\{[\s\S]*?\}/, '.hero .imgbox{background:rgba(255,255,255,.14);border-radius:var(--r-md);min-height:160px;}'),
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
    style: Math.round(m.RecalcStyleDuration * 1000),
    count: m.LayoutCount,
  };
  await page.close();
  return r;
}
function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const R = Number(process.argv[2] || 5);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (const [name, css] of Object.entries(VARIANTS)) {
    const acc = { layout: [], style: [], count: [] };
    for (let i = 0; i < R; i++) {
      const r = await once(browser, css);
      for (const k of Object.keys(acc)) acc[k].push(r[k]);
    }
    console.log(name.padEnd(16) + ' Layout ' + String(median(acc.layout)).padStart(5) +
      'ms(n=' + median(acc.count) + ')  Style ' + String(median(acc.style)).padStart(4) + 'ms   tap: ' + acc.layout.join(','));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
