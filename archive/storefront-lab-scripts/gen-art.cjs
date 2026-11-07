// scripts/gen-art.cjs — Sinh src/styles/art.css: "anh trang tri" SVG inline (data URI).
//
// LY DO THAY EMOJI (do bang scripts/css-lab3.cjs, CPU throttle 4x, interleaved x7):
//   Emoji trong CSS `content` -> trinh duyet phai FALLBACK sang system emoji font
//   (Segoe UI Emoji tren Windows) + SHAPING moi glyph. Layout tang +224ms chi o shell
//   (641ms -> 417ms) — chi rieng phan fallback font. Do la nguyen nhan lon cua TBT.
//
//   SVG trong `background-image` (data URI):
//     - KHONG can font -> KHONG fallback, KHONG shaping
//     - van la pseudo-element -> KHONG phai text node -> KHONG anh huong LCP (§7.1)
//     - 0 request them -> khong ton them mang
//     - mau BAKED trong SVG -> chi 1 paint layer (khong dung mask-image, tranh
//       them 1 layer compositing + 1 layer cho mask)
//
// Output: src/styles/art.css (import trong main.jsx)
const fs = require('fs');
const path = require('path');

// SVG nho gon, mau da baked (stroke = fill = cung 1 mau).
const S = {
  cafe: { c: '#A9714B', d: `<path d='M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z'/><path d='M16 11h2a2.5 2.5 0 0 1 0 5h-2'/><path d='M8 3c0 1.5-1.5 1.5-1.5 3M12 3c0 1.5-1.5 1.5-1.5 3'/>` },
  tra: { c: '#4E8B62', d: `<path d='M6 7h10v8a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z'/><path d='M9 14c2-3 5-3 7-4-.5 4-3 6-7 5z' fill='%23fff' fill-opacity='.35' stroke='none'/><path d='M11 19v3M8 22h6'/>` },
  banh: { c: '#C08A4E', d: `<path d='M4 19h16v-4H4z'/><path d='M4 15c0-1.5 1-2.5 2.5-2.5S9 13.5 9 15s1 2.5 2.5 2.5S14 16 14 15s1-2.5 2.5-2.5S19 13.5 19 15'/><path d='M12 12V8'/><circle cx='12' cy='6.5' r='1.6'/>` },
  combo: { c: '#3E7C9E', d: `<rect x='4' y='10' width='16' height='10' rx='1'/><path d='M3 6h18v4H3z'/><path d='M12 6v14'/><path d='M12 6c-1-3-5-4-5.5-1-.5 2.5 5.5 1 5.5 1zM12 6c1-3 5-4 5.5-1 .5 2.5-5.5 1-5.5 1z'/>` },
};
const HERO = { c: '#FFFFFF', d: `<path d='M10 24h32v16a10 10 0 0 1-10 10h-12a10 10 0 0 1-10-10z'/><path d='M42 28h4a6 6 0 0 1 0 12h-4'/><path d='M20 10c0 3-3 3-3 6M32 8c0 3-3 3-3 6'/><path d='M52 44c-3-2-7 0-7 4s4 6 7 4 3-6 0-8z' fill='%23E8A0B4' stroke='none'/>` };

const enc = (s) =>
  'data:image/svg+xml,' + encodeURIComponent(s)
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29');

const svg = (c, d, vb) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}' fill='none' stroke='${c}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>${d}</svg>`;

const L = [];
L.push('/* styles/art.css — ANH TRANG TRI (SVG inline) — sinh boi scripts/gen-art.cjs');
L.push(' *');
L.push(' * SPEC §7.1: anh trang tri phai la pseudo-element / background-image, KHONG phai');
L.push(' * text node trong DOM — neu la text node, khoi anh lon (vd 332x332) tro thanh');
L.push(' * ung vien LCP va Chrome GHI LAI LCP o thoi diem muon.');
L.push(' *');
L.push(' * Vì sao KHONG dung emoji nua:');
L.push(' *   `content: \'☕🍰\'` -> trinh duyet phai fallback sang system emoji font');
L.push(' *   (Segoe UI Emoji) + shaping moi glyph. Do duoc bang scripts/css-lab3.cjs');
L.push(' *   (CPU throttle 4x, interleaved x7): Layout cua shell tang tu 417ms len 641ms');
L.push(' *   (+224ms) — chi rieng phan fallback font. Day la nguyen nhan lon cua');
L.push(' *   TBT > 200ms. SVG data-URI: 0 font, 0 shaping, 0 request them.');
L.push(' */');
L.push('');

for (const [k, v] of Object.entries(S)) {
  const uri = enc(svg(v.c, v.d, '0 0 24 24'));
  L.push(`.art-${k}::after {`);
  L.push(`  content: '';`);
  L.push(`  display: block;`);
  L.push(`  width: 46%; height: 46%;`);
  L.push(`  background: url("${uri}") center / contain no-repeat;`);
  L.push(`}`);
  L.push('');
}

const heroUri = enc(svg(HERO.c, HERO.d, '0 0 64 64'));
L.push('.hero .imgbox::after {');
L.push(`  content: '';`);
L.push(`  display: block;`);
L.push(`  width: 62%; height: 62%;`);
L.push(`  background: url("${heroUri}") center / contain no-repeat;`);
L.push('}');
L.push('');

const out = L.join('\n');
const dest = path.join(__dirname, '..', 'src', 'styles', 'art.css');
fs.writeFileSync(dest, out, 'utf8');
console.log('-> src/styles/art.css (' + out.length + ' bytes)');
