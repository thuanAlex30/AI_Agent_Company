// scripts/font-lab.cjs — Kiem do font-swap gay full relayout khong (tren server that).
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';

async function run(label, blockFonts) {
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
  if (blockFonts) {
    await page.setRequestInterception(true);
    page.on('request', (r) => (/\.(woff2?|ttf|otf)(\?|$)/i.test(r.url()) ? r.abort() : r.continue()));
  }
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const lt = await page.evaluate(() => new Promise((res) => {
    const out = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) out.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
    setTimeout(() => res(out), 100);
  }));
  await browser.close();
  return {
    task: Math.round(m.TaskDuration * 1000),
    script: Math.round(m.ScriptDuration * 1000),
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    layouts: m.LayoutCount,
    tbt: lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
    lt,
  };
}

(async () => {
  for (const [label, block] of [['with-fonts', false], ['no-fonts', true]]) {
    const r = await run(label, block);
    console.log(
      `${label.padEnd(12)} Task=${String(r.task).padStart(6)} Script=${String(r.script).padStart(5)} ` +
      `Layout=${String(r.layout).padStart(5)} Style=${String(r.style).padStart(4)} layouts=${String(r.layouts).padStart(3)} ` +
      `TBT=${String(r.tbt).padStart(5)}ms LT=[${r.lt.join(',')}]`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
