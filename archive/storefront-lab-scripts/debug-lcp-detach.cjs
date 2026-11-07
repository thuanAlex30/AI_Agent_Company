// scripts/debug-lcp-detach.cjs — Truy tim phan tu bi REMOVE khoi DOM
// gay ra LCP entry "DETACHED" (entry.element == null).
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTES = (process.argv[3] || '/san-pham/ca-phe-sua').split(',');
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
      offline: false, latency: 150,
      downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
    });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluateOnNewDocument(() => {
      window.__lcp = [];
      window.__removed = [];
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__lcp.push({
            t: Math.round(e.startTime), size: e.size,
            id: e.id, el: e.element ? e.element.tagName + '.' + (e.element.className || '') : 'NULL',
            txt: e.element ? (e.element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) : '',
          });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      // Theo doi node bi remove -> ghi lai thong tin tai thoi diem remove
      new MutationObserver((muts) => {
        for (const m of muts) {
          for (const n of m.removedNodes) {
            if (n.nodeType !== 1) continue;
            const r = n.getBoundingClientRect ? n.getBoundingClientRect() : null;
            window.__removed.push({
              t: Math.round(performance.now()),
              el: n.tagName + '.' + (n.className || ''),
              txt: (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
              rect: r ? Math.round(r.width) + 'x' + Math.round(r.height) : 'n/a',
              parent: m.target.nodeType === 1 ? m.target.tagName + '.' + (m.target.className || '') : '?',
            });
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    });
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise((s) => setTimeout(s, 3000));
    const r = await page.evaluate(() => ({ lcp: window.__lcp, removed: window.__removed }));
    console.log('\n===== ' + route + ' =====');
    console.log('--- LCP entries ---');
    for (const e of r.lcp) console.log(`  t=${String(e.t).padStart(6)}ms size=${String(e.size).padStart(6)} id=${e.id} ${e.el} "${e.txt}"`);
    console.log('--- removed nodes ---');
    for (const e of r.removed.slice(0, 40)) console.log(`  t=${String(e.t).padStart(6)}ms ${e.el} rect=${e.rect} parent=${e.parent} "${e.txt}"`);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
