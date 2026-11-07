// scripts/task-attr.cjs — Ghep long task voi trace event ben trong (attribution thu cong).
// Cho biet task lon do gi: Layout / Style / Script / Paint.
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/';
const RUNS = Number(process.argv[4] || 3);

async function run(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150,
    downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluateOnNewDocument(() => {
    window.__lt = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__lt.push({ s: e.startTime, d: e.duration });
      }).observe({ type: 'longtask', buffered: true });
    } catch (e) {}
  });
  const events = [];
  client.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await client.send('Tracing.start', {
    traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] },
    transferMode: 'ReportEvents',
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 4000));
  const done = new Promise((r) => client.once('Tracing.tracingComplete', r));
  await client.send('Tracing.end');
  await done;
  const lt = await page.evaluate(() => window.__lt);
  await page.close();
  return { lt, events };
}

const INTEREST = ['Layout', 'UpdateLayoutTree', 'ParseHTML', 'FunctionCall', 'EvaluateScript', 'v8.evaluateModule', 'TimerFire', 'EventDispatch', 'Paint', 'PrePaint', 'CommitLoad', 'ParseAuthorStyleSheet', 'UpdateLayerTree', 'Layerize', 'HitTest'];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (let r = 0; r < RUNS; r++) {
    const { lt, events } = await run(browser);
    // Chuan hoa timestamp: trace ts (us) -> page ms
    const t0 = Math.min(...events.map((e) => e.ts).filter(Boolean));
    const trace = events
      .filter((e) => e.dur > 0 && INTEREST.includes(e.name))
      .map((e) => ({ name: e.name, s: (e.ts - t0) / 1000, d: e.dur / 1000 }));
    console.log('=== RUN ' + (r + 1) + ' — long tasks (' + lt.length + ') ===');
    const sorted = [...lt].sort((a, b) => b.d - a.d).slice(0, 6);
    for (const t of sorted) {
      const inside = trace.filter((e) => e.s >= t.s - 1 && e.s + e.d <= t.s + t.d + 2);
      const agg = {};
      for (const e of inside) agg[e.name] = (agg[e.name] || 0) + e.d;
      const parts = Object.entries(agg).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => k + '=' + Math.round(v) + 'ms').join(' ');
      console.log('  task ' + Math.round(t.d) + 'ms @' + Math.round(t.s) + 'ms  ->  ' + (parts || '(khong attribute)'));
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
