// scripts/bisect-tbt.cjs — Do TBT cua 1 route voi cac bien the thu nghiem.
// Bien: none | no-reveal | no-chat | no-storage | no-fonts | css-off
// Dung de tim bit nao gay long task (React mount / reveal / chat / font swap).
const puppeteer = require('puppeteer-core');
const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROUTE = process.argv[3] || '/thanh-toan';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const VARIANTS = ['none', 'no-reveal', 'no-chat', 'no-storage', 'no-fonts', 'no-transition'];

async function run(variant) {
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

  if (variant !== 'none') {
    await page.evaluateOnNewDocument((v) => {
      if (v === 'no-reveal') {
        // Vo IntersectionObserver -> useReveal khong bao gio observe
        window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      }
      if (v === 'no-chat') {
        window.__blockChat = true;
      }
      if (v === 'no-storage') {
        const s = window.localStorage;
        Object.defineProperty(window, 'localStorage', {
          value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
          configurable: true,
        });
      }
      if (v === 'no-fonts') {
        // Chan font -> dung fallback he thong
        document.addEventListener('DOMContentLoaded', () => {
          const st = document.createElement('style');
          st.textContent = '*{font-family:system-ui,sans-serif !important}';
          document.head.appendChild(st);
        });
      }
      if (v === 'no-transition') {
        document.addEventListener('DOMContentLoaded', () => {
          const st = document.createElement('style');
          st.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
          document.head.appendChild(st);
        });
      }
    }, variant);
  }
  if (variant === 'no-chat') {
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().includes('ChatWidget') ? r.abort() : r.continue()));
  }

  await page.evaluateOnNewDocument(() => {
    window.__lt = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) });
    }).observe({ type: 'longtask', buffered: true });
  });

  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((s) => setTimeout(s, 2500));
  const lt = await page.evaluate(() => window.__lt);
  await browser.close();

  const fcp = await null;
  const tbt = lt.reduce((s, e) => s + Math.max(0, e.d - 50), 0);
  const maxT = lt.reduce((m, e) => Math.max(m, e.d), 0);
  return { tbt, maxT, n: lt.length, lt };
}

(async () => {
  for (const v of VARIANTS) {
    const r = await run(v);
    console.log(
      v.padEnd(14) + ' TBT=' + String(r.tbt).padStart(5) + 'ms  tasks=' + String(r.n).padStart(3) +
      '  maxTask=' + String(r.maxT).padStart(5) + 'ms  [' + r.lt.map((e) => e.t + '+' + e.d).join(' ') + ']'
    );
  }
})().catch((e) => { console.error(e); process.exit(1); });
