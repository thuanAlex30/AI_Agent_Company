// scripts/check-overlap.cjs — Kiem tra cac vung cham cu (target-size) co CHONG NHAU
// tren tung route: do rect cu moi phan tu cham roi tim cap.
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTES = (process.argv[3] || '/,/san-pham,/san-pham/ca-phe-sua,/thanh-toan,/gio').split(',');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  for (const route of ROUTES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise((s) => setTimeout(s, 1200));
    const r = await page.evaluate(() => {
      const sel = 'button, a[href], input, select, textarea, [role="button"]';
      const els = Array.from(document.querySelectorAll(sel)).filter((e) => {
        const rect = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return rect.width > 0 && rect.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      });
      const out = [];
      for (let i = 0; i < els.length; i++) {
        for (let j = i + 1; j < els.length; j++) {
          const a = els[i].getBoundingClientRect();
          const b = els[j].getBoundingClientRect();
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 2 && oy > 2) {
            out.push({
              a: els[i].tagName + '.' + (els[i].className || ''),
              b: els[j].tagName + '.' + (els[j].className || ''),
              ox: Math.round(ox), oy: Math.round(oy),
              ar: `${Math.round(a.width)}x${Math.round(a.height)}`,
              br: `${Math.round(b.width)}x${Math.round(b.height)}`,
            });
          }
        }
      }
      // Muc dich cham nho < 24px (WCAG 2.2 target size minimum)
      const small = els.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width < 24 || r.height < 24;
      }).map((e) => {
        const r = e.getBoundingClientRect();
        return e.tagName + '.' + (e.className || '') + ` ${Math.round(r.width)}x${Math.round(r.height)}`;
      });
      return { out, small, h: document.documentElement.scrollHeight, vh: window.innerHeight };
    });
    console.log(`\n=== ${route} (scrollHeight=${r.h}, vh=${r.vh}) ===`);
    if (!r.out.length && !r.small.length) console.log('  (khong co chong chap / muc cham nho)');
    for (const o of r.out) console.log(`  OVERLAP ${o.a} [${o.ar}] <-> ${o.b} [${o.br}]  overlap=${o.ox}x${o.oy}`);
    for (const s of r.small) console.log(`  SMALL   ${s}`);
    await page.close();
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
