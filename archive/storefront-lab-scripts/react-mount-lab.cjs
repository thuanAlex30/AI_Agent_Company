// scripts/react-mount-lab.cjs — Do chi phi React MOUNT (render + commit) tach rieng,
// va kiem tra co the tach thanh nhieu task < 50ms (de TBT = 0) hay khong.
//
// Ky thuat: dung CDP Profiler, chi do khoang thoi gian mount (tu luc module
// index.js bat dau eval den khi settle). Bieu do theo "task lon".
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/';
const RUNS = Number(process.argv[4] || 3);

async function run(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument(() => {
    window.__lt = [];
    window.__mark = {};
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ s: e.startTime, d: e.duration }); })
        .observe({ type: 'longtask', buffered: true });
    } catch (e) {}
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 4000));
  const out = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint');
    const fcp = p.find((x) => x.name === 'first-contentful-paint');
    const fcpT = fcp ? fcp.startTime : 0;
    const lt = window.__lt.map((x) => ({ s: Math.round(x.s), d: Math.round(x.d) })).sort((a, b) => a.s - b.s);
    let tbt = 0;
    for (const t of lt) { if (t.s + t.d <= fcpT) continue; tbt += Math.max(0, t.d - 50); }
    return { fcp: Math.round(fcpT), tbt, lt, nodes: document.querySelectorAll('*').length };
  });
  await page.close();
  return out;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (let i = 0; i < RUNS; i++) {
    const r = await run(browser);
    console.log('RUN ' + (i + 1) + '  FCP ' + r.fcp + '  TBT ' + r.tbt + '  nodes ' + r.nodes);
    console.log('   long tasks: ' + r.lt.map((t) => t.d + 'ms@' + t.s).join('  '));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
