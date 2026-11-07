// scripts/ab-html.cjs — A/B tren trang THAT bang cach SUA HTML response (khong inject style
// sau DOMContentLoaded -> khong gay them 1 vong style recalc + layout phu).
// Variants: ten=regexThatCanReplaceCss hoac ten=<<FULL CSS THAY THE>>
//
// Usage: node scripts/ab-html.cjs <baseUrl> <route> <rounds> "<name>" "<cssOverride|->" ...
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const BASE = process.argv[2];
const ROUTE = process.argv[3];
const ROUNDS = Number(process.argv[4] || 5);
const VARIANTS = process.argv.slice(5).map((s) => {
  const i = s.indexOf('=');
  return { name: s.slice(0, i), css: s.slice(i + 1) };
});

const RAW = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const CSS_ORIG = RAW.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];

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

  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    if (req.url() === BASE + ROUTE || req.url() === BASE + ROUTE + '/' || req.url().endsWith('/index.html')) {
      const body = css === '-' ? RAW : RAW.replace(/<style[^>]*>[\s\S]*?<\/style>/, '<style>' + css + '</style>');
      try {
        await req.respond({
          status: 200,
          contentType: 'text/html; charset=utf-8',
          body,
          headers: { 'Cache-Control': 'no-store' },
        });
        return;
      } catch (e) { /* fallthrough */ }
    }
    req.continue();
  });

  await page.evaluateOnNewDocument(() => {
    window.__lt = []; window.__cls = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ s: e.startTime, d: e.duration }); })
        .observe({ type: 'longtask', buffered: true });
    } catch (e) {}
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
        .observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}
  });

  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 3500));
  const out = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint');
    const fcp = p.find((x) => x.name === 'first-contentful-paint');
    const fcpT = fcp ? fcp.startTime : 0;
    let tbt = 0;
    for (const t of window.__lt) { if (t.s + t.d <= fcpT) continue; tbt += Math.max(0, t.d - 50); }
    return { fcp: Math.round(fcpT), tbt: Math.round(tbt), cls: +window.__cls.toFixed(4), n: window.__lt.length };
  });
  await page.close();
  return out;
}
function stat(a) { const v = [...a].sort((x, y) => x - y); return { min: v[0], med: v[Math.floor(v.length / 2)], max: v[v.length - 1] }; }

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const acc = {};
  VARIANTS.forEach((v) => (acc[v.name] = { tbt: [], fcp: [], cls: [], n: [] }));
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of VARIANTS) {
      const r = await run(browser, v.css === '-' ? CSS_ORIG : v.css);
      acc[v.name].tbt.push(r.tbt);
      acc[v.name].fcp.push(r.fcp);
      acc[v.name].cls.push(r.cls);
      acc[v.name].n.push(r.n);
    }
  }
  console.log('=== AB HTML ' + ROUTE + ' (' + ROUNDS + ' vong xen ke) ===');
  for (const v of VARIANTS) {
    const t = stat(acc[v.name].tbt);
    const f = stat(acc[v.name].fcp);
    const c = stat(acc[v.name].cls);
    console.log(
      v.name.padEnd(22) +
      ' TBT min ' + String(t.min).padStart(5) + ' med ' + String(t.med).padStart(5) +
      ' | FCP min ' + String(f.min).padStart(5) +
      ' | CLS max ' + c.max.toFixed(3) +
      ' | tap ' + acc[v.name].tbt.join(',')
    );
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
