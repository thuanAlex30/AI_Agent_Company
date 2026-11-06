// scripts/bisect-font.cjs — Serve dist/ that (keo font that) va bien CSS,
// do Layout/FCP de xac nhan webfont swap co gay layout re khong.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const puppeteer = require('puppeteer-core');

const DIST = path.join(__dirname, '..', 'dist');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROUTE = process.argv[2] || '/thanh-toan';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };

const PATCHES = {
  'baseline': null,
  'no-fontfaces': (h) => h.replace(/@font-face\s*\{[^}]*\}/g, '').replace(/font-family:\s*['"]?Be Vietnam Pro['"]?/g, 'font-family:system-ui'),
  'no-size-adjust': (h) => h.replace(/size-adjust:[^;}]*;?/g, '').replace(/ascent-override:[^;}]*;?/g, '').replace(/descent-override:[^;}]*;?/g, '').replace(/line-gap-override:[^;}]*;?/g, ''),
  'no-overrides': (h) => h.replace(/size-adjust:[^;}]*;?/g, ''),
  'no-emoji': (h) => h.replace(/content:\s*['"](☕|🍰|🍑|🎁)['"]/g, 'content:none'),
  'no-preload': (h) => h.replace(/<link rel="preload" as="font"[^>]*>/g, ''),
};

function startServer(patchFn) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = req.url.split('?')[0];
      if (p === '/') p = '/index.html';
      const f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        let body = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
        if (patchFn) body = patchFn(body);
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        return res.end(body);
      }
      const buf = fs.readFileSync(f);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000' });
      res.end(buf);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function measure(patchFn) {
  const srv = await startServer(patchFn);
  const port = srv.address().port;
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
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().endsWith('.js') ? r.abort() : r.continue()));

  const events = [];
  client.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await client.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline'], recordMode: 'recordAsMuchAsPossible' } });
  await page.goto(`http://127.0.0.1:${port}${ROUTE}`, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 1500));
  const done = new Promise((res) => client.once('Tracing.tracingComplete', res));
  await client.send('Tracing.end');
  await done;

  const agg = new Map();
  for (const e of events) if (e.dur) agg.set(e.name, (agg.get(e.name) || 0) + e.dur);
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0);
  const fonts = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.name.includes('.woff2')).map((r) => Math.round(r.startTime) + '+' + Math.round(r.responseEnd)));
  await browser.close();
  srv.close();
  return {
    layout: Math.round((agg.get('Layout') || 0) / 1000),
    style: Math.round((agg.get('UpdateLayoutTree') || 0) / 1000),
    fcp: Math.round(fcp),
    fonts,
  };
}

(async () => {
  console.log('=== FONT bisect (JS blocked, fonts that) ' + ROUTE + ' ===');
  for (const [name, fn] of Object.entries(PATCHES)) {
    const r = await measure(fn);
    console.log(`  ${name.padEnd(15)} Layout=${String(r.layout).padStart(5)}ms Style=${String(r.style).padStart(4)}ms FCP=${String(r.fcp).padStart(5)}ms  fonts=[${r.fonts.join(' ')}]`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
