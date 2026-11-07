// scripts/serve-dir.cjs — Serve 1 thu muc build bat ky tren port (khong sua file).
// Dung cho A/B giua 2 build (scripts/ab-build.cjs).
//   node scripts/serve-dir.cjs <dir> <port> [apiTarget]
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const PORT = Number(process.argv[3] || 4174);
const API_TARGET = process.argv[4] || 'http://127.0.0.1:3000';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml)|image\/svg)/;

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
  const file = path.join(ROOT, p);
  const idx = path.join(ROOT, 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const body = fs.readFileSync(idx);
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
}).listen(PORT, () => console.log(`serve ${ROOT} tren http://127.0.0.1:${PORT}`));
