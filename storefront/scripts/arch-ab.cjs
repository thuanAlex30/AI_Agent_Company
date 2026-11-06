// scripts/arch-ab.cjs — A/B giua 2 server (vd 4173 vs 4174) tren cung route.
// Do TBT + LCP + CLS + Task + Layout, xen ke N vong, lay median.
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
    setTimeout(() => res(last ? { t: Math.round(last.startTime), tag: last.element ? last.element.tagName + '.' + String(last.element.className || '').slice(0, 30) : '' } : null), 100);
  }));
  const cls = await page.evaluate(() => new Promise((res) => {
    let v = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => res(v), 100);
  }));
  const dom = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    cards: document.querySelectorAll('.pcard').length,
    h1: ((document.querySelector('h1') || {}).textContent || '').slice(0, 24),
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
    lcp: lcp ? lcp.t : -1,
    lcpTag: lcp ? lcp.tag : '',
    cls,
    dom,
  };
}

(async () => {
  const acc = { A: [], B: [] };
  for (let i = 0; i < ROUNDS; i++) {
    acc.A.push(await run(A));
    acc.B.push(await run(B));
  }
  const med = (arr, k) => { const v = arr.map((x) => x[k]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : '-'; };
  console.log(`=== ARCH A/B x${ROUNDS} on ${ROUTE} ===`);
  for (const [label, arr] of [['A(' + A + ')', acc.A], ['B(' + B + ')', acc.B]]) {
    console.log(
      `${label.padEnd(26)} TBT=${String(med(arr, 'tbt')).padStart(5)}ms maxLT=${String(med(arr, 'maxlt')).padStart(4)} ` +
      `Task=${String(med(arr, 'task')).padStart(5)} Script=${String(med(arr, 'script')).padStart(5)} ` +
      `Layout=${String(med(arr, 'layout')).padStart(5)} Style=${String(med(arr, 'style')).padStart(4)} layouts=${String(med(arr, 'layouts')).padStart(3)} ` +
      `LCP=${String(med(arr, 'lcp')).padStart(5)} CLS=${Number(med(arr, 'cls')).toFixed(3)} nodes=${med(arr, 'dom').nodes} h1="${med(arr, 'dom').h1}"`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
