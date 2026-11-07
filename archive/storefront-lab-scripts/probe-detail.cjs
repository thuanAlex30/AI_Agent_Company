// scripts/probe-detail.cjs — Dump trang thai DOM + LCP chi tiet cho route chi tiet
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham/ca-phe-sua';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

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
  await page.evaluateOnNewDocument(() => {
    window.__ev = [];
    const t0 = performance.now();
    const mark = (s) => window.__ev.push({ t: Math.round(performance.now() - t0), s });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        mark('LCP size=' + e.size + ' url=' + (e.url || '-') + ' id=' + (e.id || 'NULL') +
             ' el=' + (e.element ? e.element.tagName + '.' + (e.element.className || '') : 'NULL') +
             ' txt="' + (e.element ? (e.element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) : '') + '"');
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.removedNodes) {
          if (n.nodeType !== 1) continue;
          mark('REMOVED ' + n.tagName + '.' + (n.className || '') + ' "' + (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) + '"');
        }
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          mark('ADDED ' + n.tagName + '.' + (n.className || '') + ' "' + (n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) + '"');
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 3000));
  const r = await page.evaluate(() => ({
    ev: window.__ev,
    h1: Array.from(document.querySelectorAll('h1')).map((e) => e.textContent),
    lcp: performance.getEntriesByType('largest-contentful-paint').map((e) => ({ t: Math.round(e.startTime), size: e.size, url: e.url })),
    html: document.querySelector('#root') ? document.querySelector('#root').innerHTML.slice(0, 200) : 'NO ROOT',
  }));
  console.log('=== TIMELINE ' + ROUTE + ' ===');
  for (const e of r.ev) console.log(`  t=${String(e.t).padStart(6)}ms  ${e.s}`);
  console.log('=== FINAL LCP ENTRIES ===');
  for (const e of r.lcp) console.log(`  t=${e.t}ms size=${e.size} url=${e.url || '-'}`);
  console.log('H1s:', JSON.stringify(r.h1));
  console.log('ROOT:', r.html);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
