// scripts/trace-deep.cjs — Bat trace va MO phan lon nhat cua mot RunTask (task dai nhat).
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
        'blink.user_timing', 'v8', 'v8.execute', 'blink.console',
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

  const X = events.filter((e) => e.ph === 'X' && e.dur).sort((a, b) => a.ts - b.ts);
  const tasks = X.filter((e) => e.name === 'RunTask').sort((a, b) => b.dur - a.dur);
  console.log('Top RunTask durations (ms):', tasks.slice(0, 8).map((t) => Math.round(t.dur / 1000)).join(', '));

  const big = tasks[0];
  console.log(`\n=== INSIDE biggest RunTask (${Math.round(big.dur / 1000)}ms @ ts=${big.ts}) ===`);
  const inner = X.filter((e) => e.ts >= big.ts && e.ts + e.dur <= big.ts + big.dur && e.name !== 'RunTask');
  const byName = new Map();
  for (const e of inner) {
    const o = byName.get(e.name) || { t: 0, n: 0, max: 0, sample: null };
    o.t += e.dur; o.n++; if (e.dur > o.max) { o.max = e.dur; o.sample = e; }
    byName.set(e.name, o);
  }
  for (const [n, o] of [...byName.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 18)) {
    let extra = '';
    const d = (o.sample.args && (o.sample.args.data || o.sample.args.beginData)) || {};
    if (d.functionName) extra += ' fn=' + d.functionName;
    if (d.url) extra += ' url=' + String(d.url).slice(-55);
    if (d.elementCount !== undefined) extra += ' elems=' + d.elementCount;
    if (d.invalidationCount !== undefined) extra += ' inval=' + d.invalidationCount;
    if (d.dirtyObjects !== undefined) extra += ` dirty=${d.dirtyObjects}/${d.totalObjects}`;
    console.log(`  ${n.padEnd(30)} sum=${String(Math.round(o.t / 1000)).padStart(5)}ms max=${String(Math.round(o.max / 1000)).padStart(5)}ms n=${o.n}${extra}`);
  }

  console.log('\n=== v8 / GC / compile events (top 15) ===');
  for (const e of X.filter((x) => /^(v8|GC|Compiler|LazyCompile|Compile|MinorGC|MajorGC)/.test(x.name)).sort((a, b) => b.dur - a.dur).slice(0, 15)) {
    console.log(`  ${Math.round(e.dur / 1000)}ms  ${e.name}  ${JSON.stringify((e.args && e.args.data) || {}).slice(0, 140)}`);
  }

  console.log('\n=== Timed sequence of major events inside big task (chronological) ===');
  const major = inner.filter((e) => e.dur > 30000).sort((a, b) => a.ts - b.ts);
  for (const e of major.slice(0, 30)) {
    const d = (e.args && (e.args.data || e.args.beginData)) || {};
    console.log(`  +${Math.round((e.ts - big.ts) / 1000)}ms  ${e.name.padEnd(26)} ${Math.round(e.dur / 1000)}ms  ${String(d.functionName || d.type || (d.url || '').slice(-40) || '')}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
