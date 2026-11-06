// scripts/font-layout-lab.cjs — Do chi phi Layout khi CO/KHONG font that (webfont that vs fallback).
// Script dung trang serve that nhung chan request woff2 de so sanh.
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/';

async function run(browser, mode) {
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
  if (mode !== 'all') {
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (mode === 'nofont' && r.url().includes('woff2')) return r.abort();
      if (mode === 'nojs' && r.url().endsWith('.js')) return r.abort();
      if (mode === 'only700' && r.url().includes('-400-normal')) return r.abort();
      r.continue();
    });
  }
  await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 3000));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const paints = await page.evaluate(() => {
    const p = performance.getEntriesByType('paint');
    const lcp = performance.getEntriesByType('largest-contentful-paint');
    return { fp: p.map((x) => Math.round(x.startTime)), lcp: lcp.map((x) => Math.round(x.startTime)) };
  });
  const out = {
    layout: Math.round(m.LayoutDuration * 1000),
    layoutCount: m.LayoutCount,
    style: Math.round(m.RecalcStyleDuration * 1000),
    styleCount: m.RecalcStyleCount,
    task: Math.round(m.TaskDuration * 1000),
    nodes: m.Nodes,
    fp: paints.fp[0], lcp: paints.lcp[paints.lcp.length - 1],
  };
  await page.close();
  return out;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (const mode of ['all', 'nofont', 'only700', 'nojs']) {
    const rs = [];
    for (let i = 0; i < 3; i++) rs.push(await run(browser, mode));
    const med = (k) => { const v = rs.map((r) => r[k]).sort((a, b) => a - b); return v[1]; };
    console.log(mode.padEnd(9) + ' Layout ' + String(med('layout')).padStart(5) + 'ms (n=' + med('layoutCount') +
      ')  Style ' + String(med('style')).padStart(4) + 'ms (n=' + med('styleCount') +
      ')  Task ' + String(med('task')).padStart(5) + 'ms  nodes ' + med('nodes') +
      '  FP ' + med('fp') + '  LCP ' + med('lcp'));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
