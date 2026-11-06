// scripts/bisect-layout.cjs — Tim nguyen nhan LayoutDuration cao qua bien the HTML.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIST = path.join(__dirname, '..', 'dist', 'index.html');
const raw = fs.readFileSync(DIST, 'utf8');

const styleM = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/);
const CSS = styleM ? styleM[1] : '';
const bodyM = raw.match(/<body[^>]*>([\s\S]*?)<script>/);
const SHELL = bodyM ? bodyM[1] : '';

const variants = {
  'full': raw,
  'no-css': raw.replace(styleM[0], '<style></style>'),
  'no-shell': raw.replace(SHELL, '<div id="root"></div>'),
  'shell-nocss': raw.replace(styleM[0], '<style></style>').replace(SHELL, '<div id="root">' + SHELL + '</div>'),
  'css-only': '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + CSS + '</style></head><body><div id="root"></div></body></html>',
};

async function measure(html) {
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
  await page.setContent(html, { waitUntil: 'load' }).catch(() => {});
  await new Promise((s) => setTimeout(s, 1500));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const long = await page.evaluate(() => new Promise((res) => {
    const out = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) out.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true });
    setTimeout(() => res(out), 100);
  }));
  await browser.close();
  return {
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    task: Math.round(m.TaskDuration * 1000),
    layouts: m.LayoutCount,
    nodes: m.Nodes,
    long,
  };
}

(async () => {
  for (const [name, html] of Object.entries(variants)) {
    const r = await measure(html);
    console.log(
      `${name.padEnd(12)} Layout=${String(r.layout).padStart(5)}ms Style=${String(r.style).padStart(4)}ms ` +
      `Task=${String(r.task).padStart(5)}ms layouts=${String(r.layouts).padStart(3)} nodes=${String(r.nodes).padStart(4)} LT=[${r.long.join(',')}]`
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
