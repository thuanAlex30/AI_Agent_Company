// scripts/dom-css-split.cjs — Tach chi phi thanh 2 phan: DOM (cau truc) vs CSS (style+layout).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const CSS = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const BODY = raw.match(/<body[\s\S]*?<\/body>/i)[0].replace(/<script[\s\S]*?<\/script>/gi, '');

async function once(browser, html) {
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
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise((s) => setTimeout(s, 800));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = {
    layout: Math.round(m.LayoutDuration * 1000),
    style: Math.round(m.RecalcStyleDuration * 1000),
    count: m.LayoutCount,
    nodes: m.Nodes,
  };
  await page.close();
  return r;
}
function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

const CASES = {
  'shell+full-css': `<style>${CSS}</style>${BODY}`,
  'shell+no-css': `${BODY}`,
  'empty+full-css': `<style>${CSS}</style><div>x</div>`,
  'shell-nohero+css': (() => {
    const b = BODY.replace(/<section class="hero"[\s\S]*?<\/section>/, '');
    return `<style>${CSS}</style>${b}`;
  })(),
  'shell-only-nav+css': (() => {
    const b = BODY.replace(/<main[\s\S]*?<\/main>/, '');
    return `<style>${CSS}</style>${b}`;
  })(),
  'shell-only-main+css': (() => {
    const b = BODY.replace(/<div class="topbar">[\s\S]*?<\/nav>/, '');
    return `<style>${CSS}</style>${b}`;
  })(),
};

(async () => {
  const R = Number(process.argv[2] || 5);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (const [name, frag] of Object.entries(CASES)) {
    const acc = { layout: [], style: [], count: [], nodes: [] };
    for (let i = 0; i < R; i++) {
      const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${frag}</head><body></body></html>`.replace(/<body>[\s\S]*<\/body>/, '');
      const h = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${frag}</head></html>`;
      const r = await once(browser, h);
      for (const k of Object.keys(acc)) acc[k].push(r[k]);
    }
    console.log(name.padEnd(20) + ' Layout ' + String(median(acc.layout)).padStart(5) +
      'ms(n=' + median(acc.count) + ')  Style ' + String(median(acc.style)).padStart(4) + 'ms  nodes ' + median(acc.nodes));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
