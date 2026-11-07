// scripts/floor-check.cjs — San floor: LayoutDuration co that tren trang rong khong?
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function once(browser, html, dsr) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: dsr });
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Performance.enable');
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise((s) => setTimeout(s, 500));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  await page.close();
  return { layout: Math.round(m.LayoutDuration * 1000), style: Math.round(m.RecalcStyleDuration * 1000), count: m.LayoutCount, nodes: m.Nodes };
}
function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const R = Number(process.argv[2] || 5);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const cases = {
    'empty': '<!DOCTYPE html><html><head></head><body></body></html>',
    'one-div': '<!DOCTYPE html><html><head></head><body><div>hello</div></body></html>',
    'body51': '<!DOCTYPE html><html><head></head><body>' + '<div><span>x</span></div>'.repeat(50) + '</body></html>',
  };
  for (const dsr of [1, 2]) {
    for (const [n, h] of Object.entries(cases)) {
      const acc = { layout: [], style: [], count: [] };
      for (let i = 0; i < R; i++) {
        const r = await once(browser, h, dsr);
        acc.layout.push(r.layout); acc.style.push(r.style); acc.count.push(r.count);
      }
      console.log('dsf=' + dsr + ' ' + n.padEnd(10) + ' Layout ' + String(median(acc.layout)).padStart(5) + 'ms Style ' + String(median(acc.style)).padStart(4) + 'ms count ' + median(acc.count));
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
