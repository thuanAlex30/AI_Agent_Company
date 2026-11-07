// scripts/font-stack-lab.cjs — Do chi phi Layout cua SHELL voi font-stack khac nhau.
// Do tren trang that (serve) nhung override --font / --font-face.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');

const FALLBACK_FACE = /@font-face\{font-family:BVP Fallback;[^}]*\}/g;

const VARIANTS = {
  'baseline': (c) => c,
  'no-bvp-fallback': (c) => c.replace(FALLBACK_FACE, ''),
  'system-only': (c) => c.replace(/--font:[^;]+;/, '--font:system-ui;'),
  'arial-only': (c) => c.replace(/--font:[^;]+;/, '--font:Arial,sans-serif;'),
  'no-webfont': (c) => c.replace(/@font-face\{font-family:Be Vietnam Pro[^}]*\}/g, ''),
  'no-font-faces-all': (c) => c.replace(/@font-face\{[^}]*\}/g, ''),
  'bvp-no-adjust': (c) => c.replace(/size-adjust:[^;]+;/g, ''),
  'no-override': (c) => c.replace(/ascent-override:[^;]+;/g, '').replace(/descent-override:[^;]+;/g, '').replace(/line-gap-override:[^;]+;/g, ''),
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
  page.on('request', (r) => (r.url().endsWith('.js') ? r.abort() : r.continue()));
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise((s) => setTimeout(s, 3000));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = {
    layout: Math.round(m.LayoutDuration * 1000),
    layoutCount: m.LayoutCount,
    style: Math.round(m.RecalcStyleDuration * 1000),
    styleCount: m.RecalcStyleCount,
    nodes: m.Nodes,
  };
  await page.close();
  return r;
}
function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const R = Number(process.argv[2] || 5);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (const [name, fn] of Object.entries(VARIANTS)) {
    const acc = { layout: [], layoutCount: [], style: [], styleCount: [], nodes: [] };
    for (let i = 0; i < R; i++) {
      const html = raw.replace(/<style id="bvp-font-faces">[\s\S]*?<\/style>/, '<style id="bvp-font-faces">' + fn(raw.match(/<style id="bvp-font-faces">([\s\S]*?)<\/style>/)[1]) + '</style>');
      const r = await once(browser, html);
      for (const k of Object.keys(acc)) acc[k].push(r[k]);
    }
    console.log(name.padEnd(18) + ' Layout ' + String(median(acc.layout)).padStart(5) + 'ms(n=' + median(acc.layoutCount) +
      ')  Style ' + String(median(acc.style)).padStart(4) + 'ms(n=' + median(acc.styleCount) + ')  nodes ' + median(acc.nodes));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
