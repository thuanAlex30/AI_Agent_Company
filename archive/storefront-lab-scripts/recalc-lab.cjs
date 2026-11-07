// scripts/recalc-lab.cjs — Do THOI GIAN Recalculate Styles (UpdateLayoutTree) va Layout
// tren trang THAT, interleaved, median. Bien: base | no-fontface | no-css | minimal-css
// | no-shell | css-half | no-inline-css ( tach CSS ra file rieng)
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham';
const ROUNDS = Number(process.argv[4] || 5);

let RAW = null;
function variant(v) {
  switch (v) {
    case 'base': return RAW;
    case 'no-fontface': return RAW.replace(/@font-face\s*\{[^}]*\}/g, '');
    case 'no-app-css': return RAW.replace(/<style id="bvp-app-css">[\s\S]*?<\/style>/, '<style id="bvp-app-css"></style>');
    case 'no-css-at-all': return RAW.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
    case 'no-shell': return RAW.replace(/<div id="root">[\s\S]*?<\/div>\s*<!--[\s\S]*?-->/, '<div id="root"></div>')
      .replace(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/, '');
    case 'css-half': {
      const m = RAW.match(/<style id="bvp-app-css">([\s\S]*?)<\/style>/);
      const css = m[1];
      // Cat nua CSS (bo cac rule sau 50%)
      const rules = css.split(/(?<=\})/);
      const half = rules.slice(0, Math.floor(rules.length / 2)).join('');
      return RAW.replace(m[0], '<style id="bvp-app-css">' + half + '</style>');
    }
    case 'css-third': {
      const m = RAW.match(/<style id="bvp-app-css">([\s\S]*?)<\/style>/);
      const css = m[1];
      const rules = css.split(/(?<=\})/);
      const part = rules.slice(0, Math.floor(rules.length / 3)).join('');
      return RAW.replace(m[0], '<style id="bvp-app-css">' + part + '</style>');
    }
    default: return RAW;
  }
}

async function run(v) {
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
  await client.send('Performance.enable');
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    try {
      if (req.resourceType() === 'document') {
        if (!RAW) RAW = await (await fetch(BASE + ROUTE)).text();
        await req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body: variant(v) });
      } else {
        await req.continue();
      }
    } catch (e) { try { await req.continue(); } catch (e2) {} }
  });
  await page.evaluateOnNewDocument(() => {
    window.__lt = []; window.__fcp = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true });
    } catch (e) {}
  });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2200));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = await page.evaluate(() => ({
    fcp: window.__fcp,
    lt: window.__lt,
    tbt: window.__lt.reduce((s, d) => s + Math.max(0, d - 50), 0),
    nodes: document.querySelectorAll('*').length,
  }));
  await browser.close();
  return {
    task: Math.round(m.TaskDuration * 1000),
    script: Math.round(m.ScriptDuration * 1000),
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    layouts: m.LayoutCount,
    ...r,
  };
}

(async () => {
  const variants = ['base', 'no-fontface', 'css-half', 'css-third', 'no-app-css', 'no-shell'];
  const acc = {};
  for (const v of variants) acc[v] = [];
  for (let i = 0; i < ROUNDS; i++) {
    for (const v of variants) acc[v].push(await run(v));
  }
  const med = (a, k) => { const x = a.map((r) => r[k]).sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
  console.log(`=== RECALC LAB x${ROUNDS} on ${ROUTE} ===`);
  for (const v of variants) {
    const a = acc[v];
    console.log(
      `${v.padEnd(14)} FCP=${String(med(a, 'fcp')).padStart(5)} TBT=${String(med(a, 'tbt')).padStart(5)} ` +
      `Style=${String(med(a, 'style')).padStart(5)} Layout=${String(med(a, 'layout')).padStart(5)} ` +
      `Task=${String(med(a, 'task')).padStart(5)} Script=${String(med(a, 'script')).padStart(5)} nodes=${med(a, 'nodes')}`
    );
    console.log(`     LT: ${a[0].lt.join(',')}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
