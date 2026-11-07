// scripts/ui-check.mjs — B2 do kiem tra responsive + a11y + hien nang (spec §10)
// Dung puppeteer-core + Chrome da cai san. Khong can tai them browser.
//   node scripts/ui-check.mjs [baseUrl]
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://127.0.0.1:5174';
const CHROME = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const ROUTES = [
  { path: '/', name: 'Landing' },
  { path: '/demo-fb', name: 'DemoFb' },
  { path: '/san-pham', name: 'Catalog' },
  { path: '/tra-cuu', name: 'Lookup' },
  { path: '/gio', name: 'Cart' },
  { path: '/ho-tro', name: 'Support' },
  { path: '/khong-co-trang-abc', name: '404' },
];

const WIDTHS = [360, 390, 768, 1024, 1440];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });

  const report = { base: BASE, routes: [], responsive: [], console: [], a11y: [] };

  // --- 1. Responsive: khong tran ngang o moi kich thuoc ---
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') report.console.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => report.console.push('PAGEERROR: ' + String(e.message).slice(0, 200)));

  for (const r of ROUTES) {
    for (const w of WIDTHS) {
      await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 });
      await page.goto(BASE + r.path, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      await new Promise((s) => setTimeout(s, 350));
      const m = await page.evaluate(() => {
        const d = document.documentElement;
        const offenders = [];
        for (const el of document.querySelectorAll('body *')) {
          const b = el.getBoundingClientRect();
          if (b.width > 0 && b.right > d.clientWidth + 2) {
            offenders.push((el.className && typeof el.className === 'string' ? el.className : el.tagName) + ' r=' + Math.round(b.right));
          }
        }
        return {
          scrollW: d.scrollWidth,
          clientW: d.clientWidth,
          hOverflow: d.scrollWidth > d.clientWidth + 2,
          offenders: offenders.slice(0, 5),
        };
      });
      report.responsive.push({ route: r.name, path: r.path, width: w, ...m });
    }
  }

  // --- 2. Trang co loi khong? (khong man hinh trang) ---
  for (const r of ROUTES) {
    await page.setViewport({ width: 390, height: 900 });
    await page.goto(BASE + r.path, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
    await new Promise((s) => setTimeout(s, 300));
    const m = await page.evaluate(() => ({
      title: document.title,
      hasMain: !!document.querySelector('main'),
      h1: document.querySelectorAll('h1').length,
      // man hinh trang = khong co main + khong noi dung
      text: (document.body.innerText || '').trim().length,
      imgsNoAlt: [...document.querySelectorAll('img')].filter((i) => i.getAttribute('alt') === null).length,
      btnNoLabel: [...document.querySelectorAll('button')].filter((b) => !(b.innerText || '').trim() && !b.getAttribute('aria-label')).length,
      inputNoLabel: [...document.querySelectorAll('input,select,textarea')].filter((i) => {
        if (i.type === 'hidden') return false;
        if (i.getAttribute('aria-label')) return false;
        if (i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`)) return false;
        return !i.closest('label');
      }).length,
    }));
    report.routes.push({ name: r.name, path: r.path, ...m });
  }

  // --- 3. Security: khong co PII/secret trong localStorage hoac URL ---
  await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
  report.a11y = await page.evaluate(() => {
    const lsKeys = Object.keys(localStorage);
    const lsVals = lsKeys.map((k) => localStorage.getItem(k) || '');
    const phoneish = lsVals.some((v) => /09\d{8,}/.test(v));
    const tokenish = lsVals.some((v) => /lookup_token/i.test(v));
    return {
      localStorageKeys: lsKeys,
      piiInLocalStorage: phoneish,
      tokenInLocalStorage: tokenish,
      urlHasToken: /token=/i.test(location.search),
      innerHtmlUsed: [...document.querySelectorAll('*')].some((e) => e.outerHTML.includes('dangerouslySetInnerHTML')),
    };
  });

  await browser.close();

  // --- Bao cao ---
  const overflow = report.responsive.filter((r) => r.hOverflow);
  const badLabels = report.routes.filter((r) => r.btnNoLabel > 0 || r.inputNoLabel > 0 || r.imgsNoAlt > 0 || !r.hasMain || r.text < 50);

  console.log('\n=== RESPONSIVE (khong tran ngang) ===');
  console.log(`Tong luot: ${report.responsive.length} | tran ngang: ${overflow.length}`);
  for (const o of overflow) console.log(`  X ${o.route} @${o.width}px scrollW=${o.scrollW} clientW=${o.clientW} ${o.offenders.join(', ')}`);

  console.log('\n=== A11Y / NOI DUNG ===');
  for (const r of report.routes) {
    const bad = r.btnNoLabel > 0 || r.inputNoLabel > 0 || r.imgsNoAlt > 0 || !r.hasMain || r.text < 50;
    console.log(`  ${bad ? 'X' : 'OK'} ${r.name.padEnd(9)} h1=${r.h1} text=${r.text} btnNoLabel=${r.btnNoLabel} inputNoLabel=${r.inputNoLabel} imgNoAlt=${r.imgsNoAlt}`);
  }

  console.log('\n=== SECURITY (giao dien) ===');
  console.log('  localStorage keys:', report.a11y.localStorageKeys.join(', '));
  console.log('  PII trong localStorage :', report.a11y.piiInLocalStorage ? 'CO (X)' : 'khong (OK)');
  console.log('  Token trong localStorage:', report.a11y.tokenInLocalStorage ? 'CO (X)' : 'khong (OK)');
  console.log('  Token trong URL       :', report.a11y.urlHasToken ? 'CO (X)' : 'khong (OK)');
  console.log('  dangerouslySetInnerHTML:', report.a11y.innerHtmlUsed ? 'CO (X)' : 'khong (OK)');

  console.log('\n=== CONSOLE ERRORS ===');
  console.log(report.console.length ? report.console.join('\n') : '  khong co');

  const pass = overflow.length === 0 && badLabels.length === 0
    && !report.a11y.piiInLocalStorage && !report.a11y.tokenInLocalStorage
    && !report.a11y.urlHasToken && report.console.length === 0;

  console.log('\nUI-CHECK: ' + (pass ? 'PASS' : 'FAIL'));
  fs.writeFileSync(path.join(__dirname, '..', 'ui-check-report.json'), JSON.stringify(report, null, 2));
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
