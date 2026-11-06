// scripts/bisect-css.cjs — JS bi chan, chi do chi phi Layout cua STATIC SHELL.
// Bien thu nghiem: bo tung nhom rule CSS de tim rule gay layout re.
// Cach do: xoa cac rule theo selector prefix roi force layout va do thoi gian.
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/thanh-toan';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

// Nhom rule theo selector de lo (regex -> chuoi de truyền qua evaluate)
const GROUPS = {
  'hero': '^\\.hero',
  'sticky-cta': '^\\.sticky-cta',
  'mobile-nav': '^\\.mobile-nav',
  'header': '^\\.header',
  'nav': '^\\.nav',
  'footer': '^\\.footer',
  'topbar': '^\\.topbar',
  'grid-card': '^\\.(grid|card|pcard|pimg|pbody)',
  'font-face': '@font-face',
};

(async () => {
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

  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().endsWith('.js') ? r.abort() : r.continue()));

  const results = [];
  for (const variant of ['baseline', ...Object.keys(GROUPS)]) {
    await page.goto(BASE + ROUTE, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
    // Do layout bang cach force style recalc + layout 5 lan
    const r = await page.evaluate((v, groupsSrc) => {
      const groups = JSON.parse(groupsSrc);
      if (v !== 'baseline') {
        const re = new RegExp(groups[v]);
        for (const sheet of Array.from(document.styleSheets)) {
          let rules;
          try { rules = Array.from(sheet.cssRules); } catch { continue; }
          for (const rule of rules) {
            if (rule.selectorText && re.test(rule.selectorText)) rule.style && (rule.style.cssText = '');
            if (rule.type === CSSRule.MEDIA_RULE) {
              try {
                for (const sub of Array.from(rule.cssRules)) {
                  if (sub.selectorText && re.test(sub.selectorText)) sub.style && (sub.style.cssText = '');
                }
              } catch {}
            }
          }
        }
      }
      // Force layout 5 lan, do tong thoi gian
      const t = performance.now();
      for (let i = 0; i < 5; i++) {
        document.documentElement.style.setProperty('--x', String(i));
        void document.body.getBoundingClientRect().height;
        void document.querySelectorAll('*').length;
      }
      return { layoutMs: Math.round(performance.now() - t), nodes: document.querySelectorAll('*').length };
    }, variant, JSON.stringify(GROUPS));
    results.push([variant, r.layoutMs, r.nodes]);
  }
  console.log('=== CSS bisect (JS blocked) ' + ROUTE + ' ===');
  console.log('  (do 5 lan force layout tren DOM shell)');
  const base = results[0][1];
  for (const [v, ms, nodes] of results) {
    const delta = ms - base;
    console.log(`  ${v.padEnd(14)} ${String(ms).padStart(5)}ms  (${delta >= 0 ? '+' : ''}${delta}ms)  nodes=${nodes}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
