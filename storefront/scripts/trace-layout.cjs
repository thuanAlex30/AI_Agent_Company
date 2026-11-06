// scripts/trace-layout.cjs — Lay 'Layout'/'UpdateLayoutTree' beginData de biet node nao dat layout.
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';

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
  const events = [];
  client.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await client.send('Tracing.start', {
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] },
    transferMode: 'ReportEvents',
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2000));
  const done = new Promise((r) => client.once('Tracing.tracingComplete', r));
  await client.send('Tracing.end');
  await done;
  await browser.close();

  const pick = (e) => (e.args && (e.args.beginData || e.args.data)) || {};
  console.log('=== Layout events (beginData) ===');
  for (const e of events.filter((x) => x.name === 'Layout').sort((a, b) => b.dur - a.dur).slice(0, 10)) {
    const d = pick(e);
    console.log(`  ${Math.round(e.dur / 1000)}ms  dirty=${d.dirtyObjects} total=${d.totalObjects} partial=${d.partialLayout} rootNeedsLayout=${d.rootNeedsLayout} stack=[${d.stackTrace ? d.stackTrace.children.map((c) => (c.callFrame || {}).functionName).join(',') : ''}]`);
  }
  console.log('\n=== UpdateLayoutTree ===');
  for (const e of events.filter((x) => x.name === 'UpdateLayoutTree').sort((a, b) => b.dur - a.dur).slice(0, 10)) {
    const d = pick(e);
    console.log(`  ${Math.round(e.dur / 1000)}ms  element=${d.elementCount || '-'} invalid=${d.invalidationCount || '-'}`);
  }

  console.log('\n=== RecalcStyle / ScheduleStyleRecalculation counts ===');
  for (const n of ['RecalcStyle', 'ScheduleStyleRecalculation', 'InvalidateLayout', 'ScheduleStyleRecalculation']) {
    const l = events.filter((x) => x.name === n);
    console.log(`  ${n}: n=${l.length} total=${Math.round(l.reduce((s, x) => s + x.dur, 0) / 1000)}ms`);
  }

  console.log('\n=== LayoutInvalidationTracking-ish: nodes with invalidation ===');
  const inv = events.filter((x) => x.name === 'InvalidateLayout');
  const byReason = {};
  for (const e of inv) {
    const d = pick(e);
    const k = (d.reason || 'unknown') + (d.nodeName ? ' ' + d.nodeName : '');
    byReason[k] = (byReason[k] || 0) + 1;
  }
  const top = Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 20);
  for (const [k, v] of top) console.log(`  ${String(v).padStart(5)}x  ${k}`);
})().catch((e) => { console.error(e); process.exit(1); });
