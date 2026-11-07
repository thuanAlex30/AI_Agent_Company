// scripts/check-art.cjs — Kiem tra data-URI SVG trong art.css co giai ma dung khong.
const fs = require('fs');
const path = require('path');
const t = fs.readFileSync(path.join(__dirname, '..', 'src', 'styles', 'art.css'), 'utf8');
const re = /url\("([^"]+)"\)/g;
let m;
let i = 0;
while ((m = re.exec(t))) {
  const uri = m[1];
  const svg = decodeURIComponent(uri.replace('data:image/svg+xml,', ''));
  const ok = svg.startsWith('<svg') && svg.endsWith('</svg>');
  console.log(`[${++i}] ok=${ok} len=${svg.length}`);
  console.log('    ' + svg.slice(0, 160));
  if (!ok) console.log('    !!! HONG');
}
