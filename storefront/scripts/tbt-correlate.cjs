// scripts/tbt-correlate.cjs — Correlate longtask voi mutation timeline
// de xac dinh task lon nao la luc React MOUNT (thay the shell).
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/thanh-toan';
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
    window.__lt = [];
    window.__ev = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        const a = e.attribution && e.attribution[0];
        window.__lt.push({
          t: Math.round(e.startTime), d: Math.round(e.duration),
          attr: a ? (a.name || a.containerType || '?') : '?',
        });
      }
    }).observe({ type: 'longtask', buffered: true });

    // Mutation timeline: chi ghi 3 moc: shell bi xoa, react them main, het
    let firstRemoval = null;
    let rootSwap = null;
    let lastAdd = null;
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.removedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'MAIN' && !firstRemoval) { firstRemoval = Math.round(performance.now()); window.__ev.push({ t: firstRemoval, s: 'REMOVE main (React xoa shell)' }); }
        }
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'MAIN' && !rootSwap) { rootSwap = Math.round(performance.now()); window.__ev.push({ t: rootSwap, s: 'ADD main (React render)' }); }
          lastAdd = Math.round(performance.now());
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2000));
  const r = await page.evaluate(() => ({ lt: window.__lt, ev: window.__ev }));

  console.log('=== ' + ROUTE + ' ===');
  console.log('MOC THOI GIAN:');
  for (const e of r.ev) console.log('  t=' + String(e.t).padStart(6) + 'ms  ' + e.s);
  console.log('\nLONG TASKS:');
  for (const e of r.lt) console.log(`  t=${String(e.t).padStart(6)}ms dur=${String(e.d).padStart(5)}ms attr=${e.attr}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
