// scripts/bisect-html.cjs — Patch HTML/CSS tren server roi do Layout/FCP that.
// dung de tim rule CSS gay layout re (emoj, font, gradient...).
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DIST = path.join(__dirname, '..', 'dist');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROUTE = process.argv[2] || '/thanh-toan';

const PATCHES = {
  'baseline': null,
  'no-emoji': (h) => h.replace(/content:\s*['"][^'"]{1,6}['"];?\s*\}\s*\.pimg/g, 'content:none}.pimg')
                 .replace(/content:\s*['"](☕|🍰|🍑|🎁)['"]/g, 'content:none'),
  'no-webfont': (h) => h.replace(/font-family:\s*'Be Vietnam Pro'/g, "font-family:system-ui")
                    .replace(/@font-face\{[^}]*\}/g, ''),
  'no-gradient': (h) => h.replace(/linear-gradient\([^)]*\)/g, '#6F4E37'),
  'no-shadow': (h) => h.replace(/box-shadow:[^;}]*;?/g, ''),
  'no-transition': (h) => h.replace(/transition:[^;}]*;?/g, ''),
  'no-aspect': (h) => h.replace(/aspect-ratio:[^;}]*;?/g, ''),
  'no-vh': (h) => h.replace(/min-height:\s*\d+vh;?/g, ''),
  'no-sticky': (h) => h.replace(/position:\s*sticky;?/g, ''),
};

function startServer(patchFn) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let body = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
      if (patchFn) body = patchFn(body);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(body);
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
  await new Promise((s) => setTimeout(s, 1200));
  const done = new Promise((res) => client.once('Tracing.tracingComplete', res));
  await client.send('Tracing.end');
  await done;

  const agg = new Map();
  for (const e of events) if (e.dur) agg.set(e.name, (agg.get(e.name) || 0) + e.dur);
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0);
  await browser.close();
  srv.close();
  return {
    layout: Math.round((agg.get('Layout') || 0) / 1000),
    style: Math.round((agg.get('UpdateLayoutTree') || 0) / 1000),
    parse: Math.round((agg.get('ParseHTML') || 0) / 1000),
    fcp: Math.round(fcp),
  };
}

(async () => {
  console.log('=== HTML/CSS patch bisect (JS blocked) ' + ROUTE + ' ===');
  const base = await measure(PATCHES.baseline);
  console.log(`  baseline        Layout=${String(base.layout).padStart(5)}ms Style=${String(base.style).padStart(4)}ms Parse=${String(base.parse).padStart(4)}ms FCP=${String(base.fcp).padStart(5)}ms`);
  for (const [name, fn] of Object.entries(PATCHES)) {
    if (name === 'baseline') continue;
    const r = await measure(fn);
    console.log(`  ${name.padEnd(14)} Layout=${String(r.layout).padStart(5)}ms Style=${String(r.style).padStart(4)}ms Parse=${String(r.parse).padStart(4)}ms FCP=${String(r.fcp).padStart(5)}ms   dLayout=${r.layout - base.layout}  dFCP=${r.fcp - base.fcp}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
