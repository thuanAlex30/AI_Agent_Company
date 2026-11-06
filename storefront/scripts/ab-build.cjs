// scripts/ab-build.cjs — A/B giua 2 thu muc build (vd dist vs dist-no-preload),
// phuc vu 2 server (4173 / 4174). Do TBT/LCP/CLS/Task/Layout, xen ke, median.
//
// Cach dung:
//   node scripts/build-variant.cjs <mode>            # tao dist-variant + serve 4174
//   node scripts/ab-build.cjs <urlA> <urlB> <route> [rounds]
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const A = process.argv[2] || 'http://127.0.0.1:4173';
const B = process.argv[3] || 'http://127.0.0.1:4174';
const ROUTE = process.argv[4] || '/san-pham';
const ROUNDS = Number(process.argv[5] || 7);

async function run(base) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
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
  await page.goto(base + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2200));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const lt = await page.evaluate(() => new Promise((res) => {
    const out = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) out.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
    setTimeout(() => res(out), 100);
  }));
  const lcp = await page.evaluate(() => new Promise((res) => {
    let last = null;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) last = e; }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => res(last ? Math.round(last.startTime) : -1), 100);
  }));
  const fcp = await page.evaluate(() => {
    const p = performance.getEntriesByName('first-contentful-paint')[0];
    return p ? Math.round(p.startTime) : -1;
  });
  const cls = await page.evaluate(() => new Promise((res) => {
    let v = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => res(v), 100);
  }));
  const dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    cards: document.querySelectorAll('.pcard').length,
    h1: ((document.querySelector('h1') || {}).textContent || '').slice(0, 20),
  }));
  await browser.close();
  return {
    task: Math.round(m.TaskDuration * 1000),
    script: Math.round(m.ScriptDuration * 1000),
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    layouts: m.LayoutCount,
    tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
    maxlt: Math.max(0, ...lt),
    lcp, fcp, cls, dom,
  };
}

(async () => {
  const acc = { A: [], B: [] };
  for (let i = 0; i < ROUNDS; i++) {
    acc.A.push(await run(A));
    acc.B.push(await run(B));
  }
  const med = (arr, k) => { const v = arr.map((x) => x[k]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : '-'; };
  console.log(`=== A/B BUILD x${ROUNDS} on ${ROUTE} ===`);
  for (const [label, arr] of [['A', acc.A], ['B', acc.B]]) {
    console.log(
      `${label} ${String(med(arr, 'tbt')).padStart(5)}ms TBT | maxLT=${String(med(arr, 'maxlt')).padStart(4)} | ` +
      `FCP=${String(med(arr, 'fcp')).padStart(5)} LCP=${String(med(arr, 'lcp')).padStart(5)} CLS=${Number(med(arr, 'cls')).toFixed(3)} | ` +
      `Task=${String(med(arr, 'task')).padStart(5)} Script=${String(med(arr, 'script')).padStart(5)} ` +
      `Layout=${String(med(arr, 'layout')).padStart(5)} Style=${String(med(arr, 'style')).padStart(4)} layouts=${String(med(arr, 'layouts')).padStart(3)} | ` +
      `nodes=${med(arr, 'dom').nodes} h1="${med(arr, 'dom').h1}"`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
