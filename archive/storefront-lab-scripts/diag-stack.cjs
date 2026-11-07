// scripts/diag-stack.cjs — Lay stackTrace cua cac event lon (FunctionCall / Layout /
// UpdateLayoutTree) de biet CHINH XAC cai gi chan main thread.
// devtools.timeline dua stack trong args.beginData.stackTrace (callFrames).
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/thanh-toan';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CPU = Number(process.env.CPU || 4);

function framesOf(e) {
  const st = e.args && e.args.beginData && e.args.beginData.stackTrace;
  if (!st || !st.callFrames) return [];
  return st.callFrames.slice(0, 8).map((f) => `${f.functionName || '(anon)'}@${String(f.url || '').split('/').pop()}:${f.lineNumber}`);
}

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

  const events = [];
  client.on('Tracing.dataCollected', (d) => events.push(...d.value));
  await client.send('Tracing.start', {
    traceConfig: {
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.invalidationTracking',
      ],
      recordMode: 'recordAsMuchAsPossible',
    },
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2000));
  const done = new Promise((res) => client.once('Tracing.tracingComplete', res));
  await client.send('Tracing.end');
  await done;

  const t0 = Math.min(...events.map((e) => e.ts).filter(Boolean));
  console.log('=== STACK ' + ROUTE + ' (CPU ' + CPU + 'x) ===');
  const targets = ['FunctionCall', 'Layout', 'UpdateLayoutTree', 'ParseHTML', 'TimerFire', 'FireAnimationFrame'];
  const list = events
    .filter((e) => targets.includes(e.name) && e.dur > 60000)
    .sort((a, b) => b.dur - a.dur)
    .slice(0, 12);
  for (const e of list) {
    const d = e.args && e.args.data ? e.args.data : {};
    console.log(`\n${e.name} t=${Math.round((e.ts - t0) / 1000)}ms dur=${Math.round(e.dur / 1000)}ms  fn=${d.functionName || '-'} url=${d.url ? String(d.url).split('/').pop() : '-'}`);
    const fr = framesOf(e);
    if (fr.length) for (const f of fr) console.log('    ' + f);
    else console.log('    (khong co stackTrace)');
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
