// scripts/cdp-metrics.cjs — Do bang tong (CDP Performance.getMetrics) cho route.
// Cho so sanh nhanh va chinh xac giua cac bien the: LayoutDuration, ScriptDuration,
// RecalcStyleDuration, TaskDuration, Nodes, LayoutCount.
// Bien: none | no-emoji | no-shell | no-react | no-css-inline
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/thanh-toan';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function run(variant) {
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

  if (variant === 'no-react') {
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().endsWith('.js') ? r.abort() : r.continue()));
  }

  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = {};
  for (const x of metrics) m[x.name] = x.value;
  const lt = await page.evaluate(() => {
    return new Promise((res) => {
      const out = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) out.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
      setTimeout(() => res(out), 100);
    });
  });
  await browser.close();
  return {
    task: Math.round(m.TaskDuration * 1000),
    script: Math.round(m.ScriptDuration * 1000),
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    layoutCount: m.LayoutCount,
    nodes: m.Nodes,
    jsHeap: Math.round((m.JSHeapUsedSize || 0) / 1048576),
    longtasks: lt,
    tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
  };
}

(async () => {
  const variants = process.argv[4] ? process.argv[4].split(',') : ['none', 'no-react'];
  console.log('=== CDP metrics ' + ROUTE + ' ===');
  for (const v of variants) {
    const r = await run(v);
    console.log(
      `  ${v.padEnd(12)} Task=${String(r.task).padStart(6)}ms Script=${String(r.script).padStart(5)}ms ` +
      `Layout=${String(r.layout).padStart(5)}ms Style=${String(r.style).padStart(4)}ms ` +
      `layouts=${String(r.layoutCount).padStart(4)} nodes=${String(r.nodes).padStart(4)} heap=${r.jsHeap}MB ` +
      `TBT=${String(r.tbt).padStart(5)}ms LT=[${r.longtasks.join(',')}]`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
