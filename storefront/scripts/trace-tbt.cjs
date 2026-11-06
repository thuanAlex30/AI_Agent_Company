// scripts/trace-tbt.cjs — Trace devtools.timeline de gan TBT chinh xac cho task dai.
// Cho ra: moi long task > 50ms, tach thanh "RunTask" + cac function node vao.
const fs = require('fs');
const path = require('path');
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

  const events = [];
  client.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await client.send('Tracing.start', {
    traceConfig: {
      includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
      recordMode: 'recordAsMuchAsPossible',
    },
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2000));
  const done = new Promise((res) => client.once('Tracing.tracingComplete', res));
  await client.send('Tracing.end');
  await done;

  // Lay cac RunTask (task lon) va noi cac function con
  const runTasks = events.filter((e) => e.name === 'RunTask' && e.dur && e.dur > 50000);
  const byId = new Map();
  for (const e of events) if (e.id && e.id !== undefined) byId.set(e.id, e);

  const t0 = Math.min(...events.map((e) => e.ts).filter(Boolean));
  console.log('=== TRACE ' + ROUTE + ' — task > 50ms ===');
  let tbt = 0;
  for (const rt of runTasks.sort((a, b) => a.ts - b.ts)) {
    const rel = Math.round((rt.ts - t0) / 1000);
    const dur = Math.round(rt.dur / 1000);
    tbt += Math.max(0, dur - 50);
    // Tim cac function node con cua task nay (cha -> con theo phien ban)
    const stack = [];
    const walk = (id, depth) => {
      const e = byId.get(id);
      if (!e) return;
      const d = e.dur ? Math.round(e.dur / 1000) : 0;
      stack.push({ depth, d, name: e.name, data: e.args && e.args.data ? String(e.args.data.functionName || e.args.data.url || e.args.data.type || '') : '' });
      for (const c of e.children || []) walk(c, depth + 1);
    };
    for (const c of rt.children || []) walk(c, 0);
    stack.sort((a, b) => b.d - a.d);
    console.log(`\n  TASK t=${rel}ms dur=${dur}ms  (TBT +${Math.max(0, dur - 50)}ms)`);
    for (const s of stack.slice(0, 8)) {
      console.log('    ' + ' '.repeat(s.depth * 2) + `${s.d}ms  ${s.name} ${s.data}`.slice(0, 160));
    }
  }
  console.log('\n  TBT (task > 50ms, tu FCP) ≈ ' + tbt + 'ms');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
