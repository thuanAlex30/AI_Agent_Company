// scripts/diag-tbt.cjs — Chan doan TBT: (1) tong thoi gian theo trace event name,
// (2) so DOM mutation theo tung 500ms de tim render loop.
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/thanh-toan';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CPU = Number(process.env.CPU || 4);

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
  if (CPU > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  // (2) Dem mutation DOM theo bucket 500ms + dem render
  await page.evaluateOnNewDocument(() => {
    window.__buckets = [];
    window.__renders = 0;
    const b = new MutationObserver((muts) => {
      const idx = Math.floor(performance.now() / 500);
      window.__buckets[idx] = (window.__buckets[idx] || 0) + muts.length;
    });
    b.observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  });

  const events = [];
  client.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await client.send('Tracing.start', {
    traceConfig: { includedCategories: ['devtools.timeline'], recordMode: 'recordAsMuchAsPossible' },
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2000));
  const done = new Promise((res) => client.once('Tracing.tracingComplete', res));
  await client.send('Tracing.end');
  await done;

  // (1) Tong thoi gian theo event name (chi event co dur)
  const agg = new Map();
  let maxDur = 0;
  for (const e of events) {
    if (!e.dur) continue;
    maxDur = Math.max(maxDur, e.dur);
    agg.set(e.name, (agg.get(e.name) || 0) + e.dur);
  }
  console.log('=== TRACE ' + ROUTE + ' (CPU throttle ' + CPU + 'x) ===');
  console.log('  tong so event: ' + events.length + '  max dur: ' + Math.round(maxDur / 1000) + 'ms');
  console.log('--- Tong thoi gian theo event name (top 20) ---');
  for (const [n, d] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log('  ' + String(Math.round(d / 1000)).padStart(6) + 'ms  ' + n);
  }
  console.log('--- Event rieng le > 100ms (top 25) ---');
  const big = events.filter((e) => e.dur > 100000).sort((a, b) => b.dur - a.dur).slice(0, 25);
  const t0 = Math.min(...events.map((e) => e.ts).filter(Boolean));
  for (const e of big) {
    const d = e.args && e.args.data ? e.args.data : {};
    const where = [d.functionName, d.url ? String(d.url).split('/').pop() + ':' + d.lineNumber : '', d.type].filter(Boolean).join(' | ');
    console.log(`  t=${String(Math.round((e.ts - t0) / 1000)).padStart(6)}ms ${String(Math.round(e.dur / 1000)).padStart(6)}ms  ${e.name.padEnd(22)} ${where.slice(0, 120)}`);
  }

  const r = await page.evaluate(() => window.__buckets);
  console.log('--- DOM mutation theo 500ms bucket ---');
  const line = [];
  for (let i = 0; i < r.length; i++) if (r[i]) line.push(i * 0.5 + 's:' + r[i]);
  console.log('  ' + line.join('  '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
