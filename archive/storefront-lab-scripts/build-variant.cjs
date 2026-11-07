// scripts/build-variant.cjs — Tao ban sao dist voi index.html da sua, serve o port khac.
// dung de A/B kien truc (bo shell / bo preload / ...).
const fs = require('fs');
const path = require('path');
const http = require('http');
const zlib = require('zlib');

const DIST = path.join(__dirname, '..', 'dist');
const OUT = path.join(__dirname, '..', 'dist-variant');
const PORT = Number(process.env.VARIANT_PORT || 4174);
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3000';

const MODE = process.argv[2] || 'base';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml)|image\/svg)/;

// Build lai dist-variant tu dist, ap dung bien the
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(DIST, OUT, { recursive: true });
const idxPath = path.join(OUT, 'index.html');
let html = fs.readFileSync(idxPath, 'utf8');

if (MODE === 'no-shell') {
  // Bo static shell (chi giu #root rong) -> React tu ve, khong co layout shell bi lang phí
  html = html.replace(/<div id="root">[\s\S]*?<\/div>\s*<!--[\s\S]*?-->/, '<div id="root"></div>');
  // Bo script route-aware
  html = html.replace(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/, '');
} else if (MODE === 'no-preload-font') {
  html = html.replace(/<link rel="preload" as="font"[^>]*>/g, '');
} else if (MODE === 'no-font-display-optional') {
  html = html.replace(/font-display:\s*optional/g, 'font-display:block');
} else if (MODE === 'no-shell-no-preload') {
  html = html.replace(/<div id="root">[\s\S]*?<\/div>\s*<!--[\s\S]*?-->/, '<div id="root"></div>');
  html = html.replace(/<script>\s*\(function \(\) \{[\s\S]*?\}\)\(\);\s*<\/script>/, '');
  html = html.replace(/<link rel="preload" as="font"[^>]*>/g, '');
}

fs.writeFileSync(idxPath, html);

function proxyApi(req, res) {
  const target = new URL(req.url, API_TARGET);
  const pr = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (pres) => {
    const headers = { ...pres.headers };
    delete headers['content-length']; delete headers['transfer-encoding'];
    const accepts = String(req.headers['accept-encoding'] || '');
    if (/gzip/.test(accepts) && String(headers['content-type'] || '').match(/json|text|javascript/)) {
      const chunks = [];
      pres.on('data', (d) => chunks.push(d));
      pres.on('end', () => {
        const gz = zlib.gzipSync(Buffer.concat(chunks), { level: 6 });
        headers['content-encoding'] = 'gzip'; headers['content-length'] = gz.length; headers.vary = 'Accept-Encoding';
        res.writeHead(pres.statusCode, headers); res.end(gz);
      });
      return;
    }
    res.writeHead(pres.statusCode, headers); pres.pipe(res);
  });
  pr.on('error', () => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"ok":false}'); });
  req.pipe(pr);
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return proxyApi(req, res);
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(OUT, p);
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const body = fs.readFileSync(idxPath);
    const headers = { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' };
    const accepts = String(req.headers['accept-encoding'] || '');
    if (accepts.includes('gzip')) {
      const gz = zlib.gzipSync(body, { level: 6 });
      headers['Content-Encoding'] = 'gzip'; headers['Content-Length'] = gz.length; headers.Vary = 'Accept-Encoding';
      res.writeHead(200, headers); return res.end(gz);
    }
    headers['Content-Length'] = body.length;
    res.writeHead(200, headers); return res.end(body);
  }
  const ext = path.extname(file);
  const buf = fs.readFileSync(file);
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  if (p.startsWith('/assets/') || p.startsWith('/fonts/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  const accepts = String(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.test(headers['Content-Type']) && buf.length > 1024 && accepts.includes('gzip')) {
    const gz = zlib.gzipSync(buf, { level: 6 });
    headers['Content-Encoding'] = 'gzip'; headers['Content-Length'] = gz.length; headers.Vary = 'Accept-Encoding';
    res.writeHead(200, headers); return res.end(gz);
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(200, headers); res.end(buf);
}).listen(PORT, () => console.log(`variant [${MODE}] tren http://127.0.0.1:${PORT}`));
