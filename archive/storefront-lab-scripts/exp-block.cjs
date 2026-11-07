// scripts/exp-block.cjs — Do FCP/LCP khi CHAN cac nhom request (font / js / css)
// de xac nhan bottleneck THAT (khong phong doan).
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';

async function measure(label, blocker) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1638.4 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (blocker(req.url())) req.abort();
    else req.continue();
  });
  await page.evaluateOnNewDocument(() => {
    window.__lcp = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp.push({ t: Math.round(e.startTime), size: e.size });
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    window.__fcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__fcp = Math.round(e.startTime);
    }).observe({ type: 'paint', buffered: true });
    window.__bytes = { total: 0, byType: {} };
    const res = performance.getEntriesByType('resource');
    setTimeout(() => {
      for (const r of res) {
        const t = r.initiatorType || 'other';
        window.__bytes.total += r.transferSize || 0;
        window.__bytes.byType[t] = (window.__bytes.byType[t] || 0) + (r.transferSize || 0);
      }
    }, 3000);
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const r = await page.evaluate(() => ({ lcp: window.__lcp, fcp: window.__fcp, bytes: window.__bytes }));
  const top = Object.entries(r.bytes.byType)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${(v / 1024).toFixed(0)}KB`)
    .join(' ');
  console.log(
    label.padEnd(24),
    'FCP', String(r.fcp).padStart(5),
    'LCP', String(r.lcp.map((e) => e.t).join('/')).padStart(14),
    '| bytes', String((r.bytes.total / 1024).toFixed(0)).padStart(4) + 'KB |', top
  );
  await browser.close();
}

(async () => {
  await measure('full', () => false);
  await measure('no fonts', (u) => u.includes('/fonts/'));
  await measure('no js', (u) => u.endsWith('.js'));
  await measure('no fonts+no js', (u) => u.includes('/fonts/') || u.endsWith('.js'));
  await measure('no api', (u) => u.includes('/api/'));
})().catch((e) => { console.error(e); process.exit(1); });
