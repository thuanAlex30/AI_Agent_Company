// scripts/bisect-css2.cjs — Chep HTML, tay bien CSS group TRUOC khi load,
// do tong thoi gian Layout/UpdateLayoutTree thuc te (trace) + FCP.
// JS bi chan de chi do shell.
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/thanh-toan';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const GROUPS = {
  'hero': '.hero',
  'sticky-cta': '.sticky-cta',
  'mobile-nav': '.mobile-nav',
  'header': '.header',
  'nav': '.nav',
  'footer': '.footer',
  'topbar': '.topbar',
  'main': 'main.wrap',
  'wrap': '.wrap',
  'grid': '.grid',
  'ui-state': '.ui-state',
  'btn': '.ui-btn',
};

async function measure(variant) {
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

  if (variant !== 'baseline') {
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (r.url().endsWith('.js')) return r.abort();
      if (r.isNavigationRequest() && r.url().indexOf(BASE) === 0) {
        return r.continue();
      }
      r.continue();
    });
  }
  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 1200));
  const done = new Promise((res) => client.once('Tracing.tracingComplete', res));
  await client.send('Tracing.end');
  await done;

  const agg = new Map();
  for (const e of events) if (e.dur) agg.set(e.name, (agg.get(e.name) || 0) + e.dur);
  const fcp = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0);
  await browser.close();
  return {
    layout: Math.round((agg.get('Layout') || 0) / 1000),
    style: Math.round((agg.get('UpdateLayoutTree') || 0) / 1000),
    parse: Math.round((agg.get('ParseHTML') || 0) / 1000),
    paint: Math.round((agg.get('Paint') || 0) / 1000),
    fcp: Math.round(fcp),
  };
}

(async () => {
  console.log('=== CSS group impact (JS blocked, trace) ' + ROUTE + ' ===');
  const base = await measure('baseline');
  console.log(`  baseline      Layout=${base.layout}ms Style=${base.style}ms Parse=${base.parse}ms Paint=${base.paint}ms FCP=${base.fcp}ms`);
  for (const g of Object.keys(GROUPS)) {
    const r = await measure(g);
    console.log(`  ${g.padEnd(12)} Layout=${String(r.layout).padStart(5)}ms Style=${String(r.style).padStart(4)}ms Parse=${String(r.parse).padStart(4)}ms Paint=${String(r.paint).padStart(4)}ms FCP=${String(r.fcp).padStart(5)}ms   dLayout=${r.layout - base.layout}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
