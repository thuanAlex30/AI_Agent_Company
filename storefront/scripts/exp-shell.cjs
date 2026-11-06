// scripts/exp-shell.cjs — Phan tich CHI SHELL (khong React): LCP element la gi,
// kich thuoc ra sao -> so sanh voi lan React render.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ORIG = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const SHELL_ONLY = ORIG.replace(/<script type="module"[^>]*><\/script>/g, '');

const INSTRUMENT = `
<script>
window.__lcp = [];
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) {
    const el = e.element;
    let rect = null;
    try { if (el) { const r = el.getBoundingClientRect(); rect = [Math.round(r.width), Math.round(r.height), Math.round(r.width*r.height)]; } } catch {}
    window.__lcp.push({
      t: Math.round(e.startTime), size: e.size,
      tag: el ? el.tagName + '.' + (el.className||'') : 'DETACHED',
      txt: el ? (el.textContent||'').slice(0,30) : '',
      rect: rect,
      fs: el ? getComputedStyle(el).fontSize : null,
    });
  }
}).observe({ type: 'largest-contentful-paint', buffered: true });
window.__h1 = null;
setTimeout(() => {
  const h = document.querySelector('h1');
  if (h) { const r = h.getBoundingClientRect(); const cs = getComputedStyle(h);
    window.__h1 = { w: Math.round(r.width), h: Math.round(r.height), fs: cs.fontSize, fw: cs.fontWeight, txt: h.textContent.slice(0,30) }; }
}, 2500);
</script>`;

const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  for (const [name, html] of [['shell only', SHELL_ONLY], ['full (react)', ORIG]]) {
    fs.writeFileSync(path.join(DIST, 'index.html'), html.replace('</body>', INSTRUMENT + '</body>'));
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    const client = await page.createCDPSession();
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1638.4 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise((s) => setTimeout(s, 2500));
    const r = await page.evaluate(() => ({ lcp: window.__lcp, h1: window.__h1 }));
    console.log('\n### ' + name);
    console.log('  H1 final:', JSON.stringify(r.h1));
    for (const e of r.lcp) console.log(`  LCP t=${e.t}ms size=${e.size} rect=${JSON.stringify(e.rect)} fs=${e.fs} ${e.tag} "${e.txt}"`);
    await browser.close();
  }
  fs.writeFileSync(path.join(DIST, 'index.html'), ORIG);
})().catch((e) => { console.error(e); fs.writeFileSync(path.join(DIST, 'index.html'), ORIG); process.exit(1); });
