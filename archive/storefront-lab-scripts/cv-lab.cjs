// scripts/cv-lab.cjs — Thu nghiem content-visibility:auto tren cac section duoi fold.
// Do Layout/Style/Task tren trang that, voi CSS inject.
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/';

const RULES = {
  'none': '',
  'cv-all-sections': 'main.wrap > section, main.wrap > nav, main.wrap > .grid, main.wrap > .sechd, main.wrap > .reveal, main.wrap > .card { content-visibility: auto; contain-intrinsic-size: auto 400px; }',
  'cv-reveal': '.reveal { content-visibility: auto; contain-intrinsic-size: auto 300px; }',
  'cv-below': 'main.wrap > .quick, main.wrap > .grid, main.wrap > .sechd, main.wrap > .reveal, main.wrap > .card, main.wrap > nav.banners { content-visibility: auto; contain-intrinsic-size: auto 400px; }',
  'cv-no-hero': 'main.wrap > *:not(.hero) { content-visibility: auto; contain-intrinsic-size: auto 400px; }',
};

async function run(browser, css) {
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
  if (css) {
    await page.evaluateOnNewDocument((c) => {
      const s = document.createElement('style');
      s.textContent = c;
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }, css);
  }
  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 3000));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const paint = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint');
    return p.map((x) => x.name + '=' + Math.round(x.startTime)).join(' ');
  });
  const out = {
    layout: Math.round(m.LayoutDuration * 1000),
    layoutCount: m.LayoutCount,
    style: Math.round(m.RecalcStyleDuration * 1000),
    styleCount: m.RecalcStyleCount,
    task: Math.round(m.TaskDuration * 1000),
    nodes: m.Nodes,
    paint,
  };
  await page.close();
  return out;
}

(async () => {
  const R = Number(process.argv[4] || 3);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (const [name, css] of Object.entries(RULES)) {
    const rs = [];
    for (let i = 0; i < R; i++) rs.push(await run(browser, css));
    const med = (k) => { const v = rs.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    console.log(name.padEnd(16) + ' Layout ' + String(med('layout')).padStart(5) + 'ms(n=' + med('layoutCount') +
      ')  Style ' + String(med('style')).padStart(4) + 'ms(n=' + med('styleCount') +
      ')  Task ' + String(med('task')).padStart(5) + 'ms  nodes ' + med('nodes') + '  ' + med('paint'));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
