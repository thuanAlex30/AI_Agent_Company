// scripts/css-lab2.cjs — Do LAI co xen ke (interleaved) de loai bo nhieu do doc.
// Vong: moi bien chay 1 lan, lap N vong, lay median theo bien.
// Bien moi thay doi 1 thuoc tinh CSS -> dung nua dau.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DIST = path.join(__dirname, '..', 'dist', 'index.html');
const raw = fs.readFileSync(DIST, 'utf8');
const styleM = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/);
const CSS = styleM[1];
const shellM = raw.match(/<body[^>]*>([\s\S]*?)<script>/);
const SHELL = shellM[1];

const mk = (extra) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${CSS}${extra || ''}</style></head><body>${SHELL}</body></html>`;

const cases = {
  'base': '',
  'svg-hero': ".hero .imgbox:after{content:''!important;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%E2%98%95%3C/text%3E%3C/svg%3E\") center/contain no-repeat!important}",
  'no-emoji-all': ".hero .imgbox:after{content:none!important}.art-cafe:after,.art-tra:after,.art-banh:after,.art-combo:after{content:none!important}",
  'emoji-text': ".hero .imgbox:after{content:'Ab'!important}",
  'no-webfont': ':root{--font:system-ui,sans-serif!important}',
  'no-imgbox': '.hero .imgbox{display:none!important}',
  'no-gradient': '.hero{background:#6F4E37!important}',
  'contain-cards': '.pcard,.card{contain:layout paint style!important}',
  'cv-cards': '.pcard,.card{content-visibility:auto!important;contain-intrinsic-size:auto 320px!important}',
};

async function once(browser, pageHtml) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const client = await page.createCDPSession();
  await client.send('Performance.enable');
  await page.setContent(pageHtml, { waitUntil: 'load' });
  await new Promise((s) => setTimeout(s, 300));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = { layout: Math.round(m.LayoutDuration * 1000), style: Math.round(m.RecalcStyleDuration * 1000) };
  await page.close();
  return r;
}

function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const ROUNDS = 9;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const acc = {};
  for (const k of Object.keys(cases)) acc[k] = { layout: [], style: [] };
  for (let i = 0; i < ROUNDS; i++) {
    for (const [name, extra] of Object.entries(cases)) {
      const r = await once(browser, mk(extra));
      acc[name].layout.push(r.layout);
      acc[name].style.push(r.style);
    }
  }
  await browser.close();
  console.log(`=== CSS LAB (interleaved, median of ${ROUNDS}) ===`);
  const base = median(acc.base.layout);
  for (const k of Object.keys(cases)) {
    const l = median(acc[k].layout);
    const s = median(acc[k].style);
    const delta = k === 'base' ? '' : `  (${l - base >= 0 ? '+' : ''}${l - base}ms vs base)`;
    console.log(`${k.padEnd(16)} Layout=${String(l).padStart(4)}ms  Style=${String(s).padStart(4)}ms${delta}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
