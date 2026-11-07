// scripts/rule-bisect.cjs — Cat CSS theo TUNG RULE (top-level) de tim rule gay Style/Layout.
// Dung shell tinh (JS chan) + phong doan nhanh bang mau CSS thuc te.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const CSS = raw.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1];
const BODY = raw.match(/<body[\s\S]*?<\/body>/i)[0].replace(/<script[\s\S]*?<\/script>/gi, '');

// Tach CSS thanh cac rule top-level (keo ca @media/@keyframes lon).
function splitRules(css) {
  const out = [];
  let i = 0, depth = 0, start = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
    }
    i++;
  }
  if (start < css.length) out.push(css.slice(start));
  return out.filter((r) => r.trim());
}

const RULES = splitRules(CSS);

async function once(browser, css) {
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
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>${BODY}</html>`;
  await page.setContent(html, { waitUntil: 'load' });
  await new Promise((s) => setTimeout(s, 600));
  const { metrics } = await client.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  const r = { layout: Math.round(m.LayoutDuration * 1000), style: Math.round(m.RecalcStyleDuration * 1000) };
  await page.close();
  return r;
}
function median(a) { const v = [...a].sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; }

(async () => {
  const R = Number(process.argv[2] || 3);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  console.log('Tong so rule top-level: ' + RULES.length);

  const measure = async (css) => {
    const acc = { layout: [], style: [] };
    for (let i = 0; i < R; i++) {
      const r = await once(browser, css);
      acc.layout.push(r.layout); acc.style.push(r.style);
    }
    return { layout: median(acc.layout), style: median(acc.style) };
  };

  const base = await measure(CSS);
  console.log('BASELINE  Layout ' + base.layout + 'ms  Style ' + base.style + 'ms');

  // Bisect: cat mot nua rule -> xem chi phi giam bao nhieu
  let lo = 0, hi = RULES.length;
  const dropped = [];
  let cur = base;
  let step = 0;
  while (hi - lo > 2 && step < 12) {
    step++;
    const mid = Math.floor((lo + hi) / 2);
    const without = RULES.slice(0, lo).concat(RULES.slice(mid));
    const m = await measure(without.join(''));
    console.log('  cat [' + mid + '..' + hi + '] -> Layout ' + m.layout + ' Style ' + m.style + ' (delta ' + (cur.layout - m.layout) + '/' + (cur.style - m.style) + ')');
    if (cur.layout - m.layout > 20 || cur.style - m.style > 15) {
      // Nhom nay dang giu nhieu chi phi -> loai tuong doi
      for (let k = mid; k < hi; k++) dropped.push(RULES[k]);
      cur = m; hi = mid;
    } else {
      lo = mid;
    }
  }
  console.log('\n=== Nhom rule gay chi phi ===');
  for (const d of dropped) console.log('  ' + d.slice(0, 160).replace(/\n/g, ' '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
