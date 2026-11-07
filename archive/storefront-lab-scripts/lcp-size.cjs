// scripts/lcp-size.cjs — Do kich thuoc H1 theo thoi gian (co throttle that) de xac nhan
// co re-paint lam LCP bi ghi lai khong.
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const THROTTLE = process.argv.includes('--throttle');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
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
    window.__snap = [];
    window.__lcp = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__lcp.push({
          t: Math.round(e.startTime),
          size: e.size,
          el: e.element ? e.element.tagName + '.' + (e.element.className || '') : '?',
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    const snap = () => {
      const h = document.querySelector('h1');
      if (!h) return;
      const r = h.getBoundingClientRect();
      const cs = getComputedStyle(h);
      window.__snap.push({
        t: Math.round(performance.now()),
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        fs: cs.fontSize,
        fw: cs.fontWeight,
        fam: cs.fontFamily.split(',')[0],
        txt: h.textContent.slice(0, 22),
        // Font that co bi dung khong? (document.fonts.check)
        loaded: document.fonts ? document.fonts.check(cs.fontWeight + ' 16px "Be Vietnam Pro"') : null,
      });
    };
    window.__snapTimer = setInterval(snap, 50);
  });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((s) => setTimeout(s, 2500));
  const r = await page.evaluate(() => ({ lcp: window.__lcp, snap: window.__snap }));
  console.log('LCP entries:');
  for (const e of r.lcp) console.log('  t=' + e.t + 'ms size=' + e.size + ' ' + e.el);
  console.log('H1 snapshots (chi hien thay doi):');
  let prev = null;
  for (const s of r.snap) {
    const key = s.w + 'x' + s.h + '|' + s.fs + '|' + s.fw + '|' + s.loaded + '|' + s.txt;
    if (key !== prev) {
      console.log(
        `  t=${String(s.t).padStart(5)}ms ${String(s.w + 'x' + s.h).padStart(12)} fs=${s.fs} fw=${s.fw} fontLoaded=${s.loaded} "${s.txt}"`
      );
      prev = key;
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
