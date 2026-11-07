// scripts/font-fit.cjs — ĐO CHIỀU RỘNG THỰC TẾ của fallback so với webfont thật,
// bằng DOM thật (KHÔNG dùng canvas: canvas không tôn trọng `unicode-range` nên
// đo sai ký tự tiếng Việt).
//
// Cơ chế (spec §7.2):
//   Chrome CHỈ cập nhật LCP khi có ứng viên MỚI có diện tích LỚN HƠN ứng viên
//   hiện tại. Vì vậy fallback phải RỘNG >= webfont thật: khi webfont swap vào,
//   vùng paint H1 nhỏ lại (hoặc bằng) -> KHÔNG có ứng viên lớn hơn ->
//   Chrome KHÔNG ghi lại LCP -> LCP chỉ có 1 entry, ở thời điểm paint đầu.
//
//   Đo bằng cách render span trong DOM với từng font-family rồi đọc
//   getBoundingClientRect() (phản ánh đúng như trình duyệt vẽ).
const puppeteer = require('puppeteer-core');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:4173';

// Fallback phải RỘNG >= webfont thật. Margin 4% cho chắc (độ rộng khác nhau
// giữa các cụm chữ, và font-synthesis có thể thêm độ dày).
const TARGET = 1.04;

const SAMPLES = [
  'BizOps Café — sáng năng lượng',
  'Thực đơn',
  'Combo sáng siêu tiết kiệm · HĐ VAT 2 ngày',
  'Đặt món',
  'Tra cứu đơn',
  'Cà phê sữa đá đậm đà pha máy, thơm béo',
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await page.evaluate(async () => {
    try { await document.fonts.ready; } catch {}
    for (const w of [400, 500, 600, 700, 800]) {
      try { await document.fonts.load(w + ' 32px "Be Vietnam Pro"'); } catch {}
    }
    try { await document.fonts.ready; } catch {}
  });

  const res = await page.evaluate(async (samples, target) => {
    // 1) Doc size-adjust hien tai cua tung @font-face 'BVP Fallback'
    const cur = {};
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch { continue; }
      for (const rule of rules || []) {
        if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
        if (!/BVP Fallback/.test(rule.style.fontFamily || '')) continue;
        const w = (rule.style.fontWeight || '400').trim();
        cur[w] = parseFloat(rule.style.sizeAdjust) || 100;
      }
    }

    // 2) Render span that trong DOM, do bounding rect
    const measure = (family, weight) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;visibility:hidden';
      document.body.appendChild(host);
      const widths = samples.map((s) => {
        const el = document.createElement('span');
        el.style.cssText = 'font-family:' + family + ';font-weight:' + weight + ';font-size:32px;letter-spacing:-.02em';
        el.textContent = s;
        host.appendChild(el);
        const w = el.getBoundingClientRect().width;
        el.remove();
        return w;
      });
      host.remove();
      return widths;
    };

    const out = [];
    for (const w of [400, 500, 600, 700, 800]) {
      const real = measure('"Be Vietnam Pro"', w);
      const fb = measure('"BVP Fallback"', w);
      const ratios = real.map((x, i) => fb[i] / x);
      const avg = ratios.reduce((p, c) => p + c, 0) / ratios.length;
      // size-adjust hien tai dang ap dung cho weight nay
      const curAdjust =
        cur[String(w)] ||
        cur[w + ' ' + w] ||
        cur['400 ' + w] ||
        cur['600 ' + w] ||
        cur['700 900'] ||
        cur['400 500'] ||
        100;
      const next = Math.round(curAdjust * (target / avg) * 100) / 100;
      out.push({
        weight: w,
        curAdjust,
        ratioAvg: Math.round(avg * 10000) / 10000,
        ratioMin: Math.round(Math.min(...ratios) * 10000) / 10000,
        ratioMax: Math.round(Math.max(...ratios) * 10000) / 10000,
        next,
        real: real.map((x) => Math.round(x * 10) / 10),
        fb: fb.map((x) => Math.round(x * 10) / 10),
      });
    }
    return { out, cur };
  }, SAMPLES, TARGET);

  console.log('MUC TIEU: fallback/webfont that >= ' + TARGET + ' (fallback RỘNG >= webfont)\n');
  for (const d of res.out) {
    console.log(
      `weight ${d.weight}: size-adjust ${d.curAdjust}% -> DE ${d.next}%   ratio TB=${d.ratioAvg} min=${d.ratioMin} max=${d.ratioMax}`
    );
    console.log(`    that     : ${d.real.join(', ')}`);
    console.log(`    fallback : ${d.fb.join(', ')}`);
  }
  console.log('\n@font-face hien tai:', JSON.stringify(res.cur));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
