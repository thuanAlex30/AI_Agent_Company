// scripts/serve-metrics.cjs — Do Performance.getMetrics tren trang SERVE THAT (khong dung trace).
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/';
const BLOCK_JS = process.argv[4] === 'nojs';

(async () => {
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
  if (BLOCK_JS) {
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().endsWith('.js') ? r.abort() : r.continue()));
  }
  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  console.log('=== ' + ROUTE + ' (JS ' + (BLOCK_JS ? 'BLOCKED' : 'ON') + ') ===');
  console.log('  LayoutDuration   ' + Math.round(m.LayoutDuration * 1000) + 'ms  (count ' + m.LayoutCount + ')');
  console.log('  RecalcStyle      ' + Math.round(m.RecalcStyleDuration * 1000) + 'ms  (count ' + m.RecalcStyleCount + ')');
  console.log('  ScriptDuration   ' + Math.round(m.ScriptDuration * 1000) + 'ms');
  console.log('  TaskDuration     ' + Math.round(m.TaskDuration * 1000) + 'ms');
  console.log('  Nodes            ' + m.Nodes + '  LayoutObjects ' + m.LayoutObjects);
  const paints = await page.evaluate(() => performance.getEntriesByType('paint').map((p) => p.name + '=' + Math.round(p.startTime)));
  console.log('  paints: ' + paints.join(', '));
  const fonts = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'css' || r.name.includes('woff')).map((r) => r.name.split('/').pop() + ' end=' + Math.round(r.responseEnd)));
  console.log('  font/css res: ' + fonts.join(' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
