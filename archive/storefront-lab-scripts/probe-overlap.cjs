// scripts/probe-overlap.cjs — In CHI TIET cac cap chong chap (route, selector, rect)
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/san-pham/ca-phe-sua';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 1200));
  const r = await page.evaluate(() => {
    const sel = 'button, a[href], input, select, textarea, [role="button"]';
    const els = Array.from(document.querySelectorAll(sel)).filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const rows = [];
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i].getBoundingClientRect();
        const b = els[j].getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 2 && oy > 2) {
          const desc = (e) => `${e.tagName}.${e.className || '-'} "${(e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 22)}" @ ${Math.round(e.getBoundingClientRect().left)},${Math.round(e.getBoundingClientRect().top)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`;
          rows.push(`  ${desc(els[i])}\n  ${desc(els[j])}\n  -> overlap ${Math.round(ox)}x${Math.round(oy)}\n`);
        }
      }
    }
    return { rows, scrollY: window.scrollY, docH: document.documentElement.scrollHeight };
  });
  console.log('=== ' + ROUTE + ' scrollY=' + r.scrollY + ' docH=' + r.docH + ' ===');
  console.log(r.rows.join('\n') || '  (khong co chong chap)');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
