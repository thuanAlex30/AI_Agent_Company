// scripts/a11y-check.cjs — Chay axe-core tren tung route, in TAT CA loi
// (severity serious/critical + tat ca rule) kem selector + mo ta.
const path = require('path');
const puppeteer = require('puppeteer-core');
const AXE = path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js');

const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTES = (process.argv[3] || '/,/san-pham,/san-pham/ca-phe-sua,/thanh-toan,/gio,/tra-cuu,/khuyen-mai,/ho-tro,/dich-vu,/tim-kiem,/xac-nhan,/khong-co-trang').split(',');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const axeSrc = require('fs').readFileSync(AXE, 'utf8');
  let totalSerious = 0;
  let totalAll = 0;

  for (const route of ROUTES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
    await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await new Promise((s) => setTimeout(s, 1200));
    await page.evaluate(axeSrc);
    const res = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        n: v.nodes.length,
        nodes: v.nodes.slice(0, 5).map((nd) => ({
          target: nd.target.join(' '),
          html: (nd.html || '').slice(0, 150),
          msg: (nd.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220),
        })),
      }));
    });
    const serious = res.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    totalSerious += serious.reduce((s, v) => s + v.n, 0);
    totalAll += res.reduce((s, v) => s + v.n, 0);
    console.log(`\n=== ${route} — ${res.length} rule vi pham (${serious.reduce((s, v) => s + v.n, 0)} serious/critical) ===`);
    if (!res.length) console.log('  (khong co vi pham)');
    for (const v of res) {
      console.log(`  [${v.impact}] ${v.id} (${v.n}) — ${v.help}`);
      for (const nd of v.nodes) {
        console.log(`      ${nd.target}`);
        console.log(`      ${nd.msg}`);
      }
    }
    await page.close();
  }
  console.log(`\n=== TONG: ${totalAll} node vi pham (${totalSerious} serious/critical) ===`);
  await browser.close();
  process.exit(totalSerious > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
