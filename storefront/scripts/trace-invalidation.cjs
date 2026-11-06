// scripts/trace-invalidation.cjs — Bat invalidation tracking de biet EXACT node nao
// trigger UpdateLayoutTree (style recalc) — do la 344ms trong task lon nhat.
const fs = require('fs');
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
    traceConfig: {
      includedCategories: [
        'devtools.timeline', 'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.invalidationTracking',
      ],
    },
    transferMode: 'ReportEvents',
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const done = new Promise((r) => client.once('Tracing.tracingComplete', r));
  await client.send('Tracing.end');
  await done;
  await browser.close();

  const inv = events.filter((e) => e.name === 'UpdateLayoutTree' || e.name === 'InvalidateLayout' || e.name === 'ScheduleStyleRecalculation' || e.name === 'StyleRecalculationInvalidationTracking');
  console.log('=== Invalidation events (top 25 by count) ===');
  const byReason = new Map();
  for (const e of inv) {
    const d = (e.args && e.args.data) || {};
    const key = `${e.name} | ${d.reason || d.invalidationReason || '?'} | ${d.nodeName || ''} | ${d.className || ''} | ${d.attributeName || ''}`;
    byReason.set(key, (byReason.get(key) || 0) + 1);
  }
  for (const [k, v] of [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${String(v).padStart(4)}x  ${k}`);
  }

  console.log('\n=== UpdateLayoutTree durations ===');
  for (const e of events.filter((x) => x.name === 'UpdateLayoutTree').sort((a, b) => b.dur - a.dur).slice(0, 8)) {
    const d = (e.args && e.args.beginData) || {};
    console.log(`  ${Math.round(e.dur / 1000)}ms  ts=${e.ts}  ` + JSON.stringify(d).slice(0, 260));
  }

  console.log('\n=== All trace event names containing "Invalidat" or "Recalc" ===');
  const names = new Set(events.filter((e) => /Invalidat|Recalc/.test(e.name)).map((e) => e.name));
  for (const n of names) {
    const l = events.filter((e) => e.name === n);
    console.log(`  ${n}: n=${l.length}`);
    for (const e of l.slice(0, 3)) {
      console.log('      ' + JSON.stringify((e.args && e.args.data) || {}).slice(0, 300));
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
