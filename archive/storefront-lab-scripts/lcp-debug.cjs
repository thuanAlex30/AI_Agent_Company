// scripts/lcp-debug.cjs — Do LCP entry thoi gian thuc te (nhieu entry) de xac nhan nguyen nhan.
//   node scripts/lcp-debug.cjs [baseUrl] [--throttle]
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const THROTTLE = process.argv.includes('--throttle');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  for (const p of ['/', '/san-pham', '/thanh-toan']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    if (THROTTLE) {
      const client = await page.createCDPSession();
      await client.send('Network.enable');
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1638.4 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
      await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.evaluateOnNewDocument(() => {
      window.__lcp = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__lcp.push({
            t: Math.round(e.startTime),
            size: e.size,
            tag: e.element ? e.element.tagName + '.' + (e.element.className || '') : '?',
            txt: e.element ? (e.element.textContent || '').slice(0, 30) : '',
          });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      window.__fcp = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__fcp = Math.round(e.startTime);
      }).observe({ type: 'paint', buffered: true });
      window.__marks = [];
      const mo = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.type === 'childList' && m.target && m.target.id === 'root') {
            window.__marks.push({ t: Math.round(performance.now()), op: 'root-children-changed' });
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    });
    await page.goto(BASE + p, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise((s) => setTimeout(s, 2000));
    const r = await page.evaluate(() => ({ lcp: window.__lcp, fcp: window.__fcp, marks: window.__marks }));
    console.log('\n=== ' + p + ' === FCP=' + r.fcp + 'ms');
    for (const e of r.lcp) console.log(`  LCP t=${e.t}ms size=${e.size} ${e.tag} "${e.txt}"`);
    for (const m of r.marks) console.log('  MUT ' + m.t + 'ms ' + m.op);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
