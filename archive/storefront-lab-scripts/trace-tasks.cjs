// scripts/trace-tasks.cjs — Bat DevTools trace de tim long task that (ten URL + function).
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
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8.execute'] },
    transferMode: 'ReportEvents',
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2000));
  const done = new Promise((r) => client.once('Tracing.tracingComplete', r));
  await client.send('Tracing.end');
  await done;
  await browser.close();

  const names = new Map();
  for (const e of events) {
    if (e.ph !== 'X' || !e.dur) continue;
    const key = e.name;
    if (!names.has(key)) names.set(key, { total: 0, max: 0, n: 0, sample: null });
    const o = names.get(key);
    o.total += e.dur; o.n++; if (e.dur > o.max) { o.max = e.dur; o.sample = e; }
  }
  console.log('=== Top event names by total duration (us) ===');
  const rows = [...names.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 22);
  for (const [n, o] of rows) {
    let extra = '';
    if (o.sample && o.sample.args) {
      const d = o.sample.args.data || {};
      if (d.url) extra = ' url=' + String(d.url).slice(-60);
      else if (d.functionName) extra = ' fn=' + d.functionName;
      else if (d.type) extra = ' type=' + d.type;
    }
    console.log(`  ${n.padEnd(34)} total=${String(Math.round(o.total / 1000)).padStart(6)}ms max=${String(Math.round(o.max / 1000)).padStart(5)}ms n=${o.n}${extra}`);
  }

  console.log('\n=== Long tasks (RunTask) with attribution ===');
  const rt = events.filter((e) => e.name === 'RunTask' && e.dur > 50000)
    .sort((a, b) => b.dur - a.dur).slice(0, 15);
  for (const e of rt) {
    const d = (e.args && e.args.data) || {};
    const frames = (d.stackTrace && d.stackTrace.children) || [];
    let src = '';
    for (const f of frames.slice(0, 3)) {
      const s = f.callFrame || {};
      src += `${s.functionName || '(anon)'}@${String(s.url || '').slice(-50)}:L${s.lineNumber} | `;
    }
    console.log(`  ${Math.round(e.dur / 1000)}ms  ${src || '(no frame)'}`);
  }

  console.log('\n=== Layout events ===');
  const lay = events.filter((e) => e.name === 'Layout' || e.name === 'UpdateLayoutTree')
    .sort((a, b) => b.dur - a.dur).slice(0, 12);
  for (const e of lay) {
    const d = (e.args && e.args.data) || {};
    console.log(`  ${e.name} ${Math.round(e.dur / 1000)}ms dirty=${d.dirtyObjects} totalObjects=${d.totalObjects}`);
  }

  console.log('\n=== FunctionCall events > 40ms ===');
  const fc = events.filter((e) => e.name === 'FunctionCall' && e.dur > 40000)
    .sort((a, b) => b.dur - a.dur).slice(0, 15);
  for (const e of fc) {
    const d = (e.args && e.args.data) || {};
    console.log(`  ${Math.round(e.dur / 1000)}ms ${d.functionName || '(anon)'} ${String(d.url || '').slice(-70)} line=${d.lineNumber}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
