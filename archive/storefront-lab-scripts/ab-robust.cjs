// scripts/ab-robust.cjs — A/B tren trang that, chong nhieu: lap N lan LAY MIN
// (min it nhieu bi anh huong tu tai nguyen may) + median, va interleaved (A,B,A,B,...)
// de so sanh cong bang.
//
// Usage: node scripts/ab-robust.cjs "<baseUrl>" "<route>" <rounds> "<nameA>=<cssA>>" "<nameB>=<cssB>>" ...
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe');

const BASE = process.argv[2];
const ROUTE = process.argv[3];
const ROUNDS = Number(process.argv[4] || 5);
const VARIANTS = process.argv.slice(5).map((s) => {
  const i = s.indexOf('=');
  return { name: s.slice(0, i), css: s.slice(i + 1) };
});

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
  await page.evaluateOnNewDocument((c) => {
    window.__lt = []; window.__cls = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ s: e.startTime, d: e.duration }); })
        .observe({ type: 'longtask', buffered: true });
    } catch (e) {}
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
        .observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}
    if (c) {
      const s = document.createElement('style');
      s.textContent = c;
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }
  }, css);
  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 3500));
  const out = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint');
    const fcp = p.find((x) => x.name === 'first-contentful-paint');
    const fcpT = fcp ? fcp.startTime : 0;
    let tbt = 0;
    for (const t of window.__lt) {
      if (t.s + t.d <= fcpT) continue;
      tbt += Math.max(0, t.d - 50);
    }
    return { fcp: Math.round(fcpT), tbt: Math.round(tbt), cls: +window.__cls.toFixed(4), n: window.__lt.length };
  });
  await page.close();
  return out;
}
function stat(a) {
  const v = [...a].sort((x, y) => x - y);
  return { min: v[0], med: v[Math.floor(v.length / 2)], max: v[v.length - 1] };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const acc = {};
  VARIANTS.forEach((v) => (acc[v.name] = { tbt: [], fcp: [], cls: [], n: [] }));
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of VARIANTS) {
      const r = await run(browser, v.css || null);
      acc[v.name].tbt.push(r.tbt);
      acc[v.name].fcp.push(r.fcp);
      acc[v.name].cls.push(r.cls);
      acc[v.name].n.push(r.n);
    }
  }
  console.log('=== AB ROBUST ' + ROUTE + ' (' + ROUNDS + ' vong xen ke) ===');
  for (const v of VARIANTS) {
    const t = stat(acc[v.name].tbt);
    const f = stat(acc[v.name].fcp);
    const c = stat(acc[v.name].cls);
    console.log(
      v.name.padEnd(24) +
      ' TBT min ' + String(t.min).padStart(5) + ' med ' + String(t.med).padStart(5) + ' max ' + String(t.max).padStart(5) +
      ' | FCP min ' + String(f.min).padStart(5) +
      ' | CLS max ' + c.max.toFixed(3)
    );
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
