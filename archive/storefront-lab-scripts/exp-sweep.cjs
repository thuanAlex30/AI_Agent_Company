// scripts/exp-sweep.cjs — Sweep bien the tren dist/index.html, do bang bench nhanh.
// Muc dich: tim bottleneck THAT cua FCP/LCP (khong phong doan).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const ORIG = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');

const FONT_TOKEN = /--font:"Be Vietnam Pro","BVP Fallback",[^;]*;/;
const noFontPreload = (h) => h.replace(/<link rel="preload" as="font"[^>]*>/g, '');
const noFontFace = (h) =>
  h.replace(/<style id="bvp-font-faces">[\s\S]*?<\/style>/, '').replace(FONT_TOKEN, '--font:system-ui,sans-serif;');
const noModulePreload = (h) => h.replace(/<link rel="modulepreload"[^>]*>/g, '');
const noScript = (h) => h.replace(/<script type="module"[^>]*><\/script>/g, '');

const variants = [
  ['1 current', ORIG],
  ['2 no font preload', noFontPreload(ORIG)],
  ['3 no font-face + no preload', noFontFace(noFontPreload(ORIG))],
  ['4 no modulepreload', noModulePreload(ORIG)],
  ['5 no script', noScript(ORIG)],
  ['6 no fonts + no modulepreload', noFontFace(noFontPreload(noModulePreload(ORIG)))],
  ['7 no script + no font preload', noScript(noFontPreload(ORIG))],
];

function bench(label) {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'bench.cjs'), '5', '/'], {
    encoding: 'utf8',
  });
  const l1 = out.split('\n')[0];
  console.log(label.padEnd(32) + l1.replace(/^route=\/\s*/, ''));
}

try {
  for (const [name, html] of variants) {
    fs.writeFileSync(path.join(DIST, 'index.html'), html);
    bench(name);
  }
} finally {
  fs.writeFileSync(path.join(DIST, 'index.html'), ORIG);
  console.log('da khoi phuc index.html goc');
}
