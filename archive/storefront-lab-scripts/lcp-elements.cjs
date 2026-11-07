// scripts/lcp-elements.cjs — Liệt kê MỌI ứng viên LCP theo thời gian (nhiều entry)
// cho từng route, kèm kích thước. Dùng để biết phần tử nào đang "cạnh tranh"
// và làm LCP bị ghi lại.
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTES = (process.argv[3] || '/,/san-pham,/san-pham/ca-phe-sua,/thanh-toan').split(',');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  for (const route of ROUTES) {
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
    await page.evaluateOnNewDocument(() => {
      window.__lcp = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const el = e.element;
          let rect = null;
          try {
            if (el) {
              const r = el.getBoundingClientRect();
              rect = Math.round(r.width) + 'x' + Math.round(r.height);
            }
          } catch {}
          window.__lcp.push({
            t: Math.round(e.startTime),
            size: e.size,
            rect,
            el: el ? el.tagName + '.' + (el.className || '') : 'DETACHED',
            txt: el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) : '',
          });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      window.__fcp = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = Math.round(e.startTime);
      }).observe({ type: 'paint', buffered: true });
    });
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise((s) => setTimeout(s, 2000));
    const r = await page.evaluate(() => ({ lcp: window.__lcp, fcp: window.__fcp }));
    console.log('\n=== ' + route + ' === FCP=' + r.fcp + 'ms');
    for (const e of r.lcp) {
      console.log(`  LCP t=${String(e.t).padStart(5)}ms size=${String(e.size).padStart(6)} rect=${String(e.rect).padEnd(9)} ${e.el} "${e.txt}"`);
    }
    if (!r.lcp.length) console.log('  (khong co LCP entry)');
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
