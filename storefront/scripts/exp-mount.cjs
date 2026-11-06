// scripts/exp-mount.cjs — So san cac STRATEGY MOUNT tren build hien tai.
// Muc dich: tim cach React KHONG ghi lai LCP (LCP chi ghi 1 lan, o paint dau).
// Bien: doi main.jsx roi build lai, do bang bench nhanh.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'src', 'main.jsx');

const BASE_IMPORT = `import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/ui.css';
import './styles.css';
import App from './App.jsx';
`;

const MOUNT_BODY = `
function mountApp() {
  if (!document.getElementById('root')) return;
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
`;

const STRATEGIES = {
  // A: mount ngay (baseline hien tai)
  'A immediate': BASE_IMPORT + `
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
  // B: cho trinh duyet paint shell truoc (rAF + macrotask)
  'B rAF+timeout': BASE_IMPORT + MOUNT_BODY + `
window.requestAnimationFrame(() => window.setTimeout(mountApp, 0));
`,
  // C: chi rAF
  'C rAF only': BASE_IMPORT + MOUNT_BODY + `
window.requestAnimationFrame(mountApp);
`,
  // D: rAF x2 (2 frame)
  'D rAFx2': BASE_IMPORT + MOUNT_BODY + `
window.requestAnimationFrame(() => window.requestAnimationFrame(mountApp));
`,
  // E: doi DOM shell -> giu nguyen, React render vao container con (khong xoa shell)
  'E shell-keep': BASE_IMPORT + MOUNT_BODY + `
(function () {
  const root = document.getElementById('root');
  const shell = document.createElement('div');
  shell.id = 'root-shell';
  // React render vao #root; shell duoc giu lai de H1 luon ton tai
  root.parentNode.insertBefore(shell, root);
  mountApp();
})();
`,
};

function build() {
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'ignore', shell: true });
}

function bench(label) {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'bench.cjs'), '7', '/'], { encoding: 'utf8' });
  const l1 = out.split('\n')[0].replace(/^route=\/\s*/, '');
  console.log(label.padEnd(20) + l1);
}

const orig = fs.readFileSync(MAIN, 'utf8');
try {
  for (const [name, src] of Object.entries(STRATEGIES)) {
    fs.writeFileSync(MAIN, src);
    build();
    bench(name);
  }
} finally {
  fs.writeFileSync(MAIN, orig);
  build();
  console.log('da khoi phuc main.jsx goc');
}
