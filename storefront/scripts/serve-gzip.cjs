// scripts/serve-gzip.cjs — Server tinh giong nginx production (gzip + cache headers)
// dung de do Lighthouse phan anh DUNG moi truong deploy that.
// Luu y: phai PROXY /api sang backend (3000) — neu khong, moi API call tra ve
// index.html (SPA fallback) -> app render loi -> so Lighthouse sai hoan toan.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', 'dist');
const PORT = Number(process.env.SERVE_PORT || 4173);
const API_TARGET = process.env.API_TARGET || 'http://127.0.0.1:3000';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml)|image\/svg)/;

function proxyApi(req, res) {
  const target = new URL(req.url, API_TARGET);
  const pr = http.request(
    target,
    { method: req.method, headers: { ...req.headers, host: target.host } },
    (pres) => {
      const headers = { ...pres.headers };
      delete headers['content-length'];
      delete headers['transfer-encoding'];
      // gzip response tu backend (noi dung tieng Viet -> tiet khoang)
      const accepts = String(req.headers['accept-encoding'] || '');
      if (/gzip/.test(accepts) && String(headers['content-type'] || '').match(/json|text|javascript/)) {
        const chunks = [];
        pres.on('data', (c) => chunks.push(c));
        pres.on('end', () => {
          const gz = zlib.gzipSync(Buffer.concat(chunks), { level: 6 });
          headers['content-encoding'] = 'gzip';
          headers['content-length'] = gz.length;
          headers.vary = 'Accept-Encoding';
          res.writeHead(pres.statusCode, headers);
          res.end(gz);
        });
        return;
      }
      res.writeHead(pres.statusCode, headers);
      pres.pipe(res);
    }
  );
  pr.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: { message: 'upstream unavailable' } }));
  });
  req.pipe(pr);
}

function sendMaybeGzip(req, res, body, type, extraHeaders) {
  const headers = { 'Content-Type': type, ...(extraHeaders || {}) };
  const accepts = String(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.test(type) && body.length > 1024 && accepts.includes('gzip')) {
    const gz = zlib.gzipSync(body, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = gz.length;
    headers.Vary = 'Accept-Encoding';
    res.writeHead(200, headers);
    return res.end(gz);
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  return res.end(body);
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/')) return proxyApi(req, res);

    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // SPA fallback — PHẢI gzip nữa, nếu không index.html (40 kB vì CSS inline)
      // chạy uncompressed -> Lighthouse "uses-text-compression" fail + TBT tăng.
      const idx = path.join(ROOT, 'index.html');
      const body = fs.readFileSync(idx);
      return sendMaybeGzip(req, res, body, MIME['.html'], { 'Cache-Control': 'no-cache' });
    }
    const ext = path.extname(file);
    const type = MIME[ext] || 'application/octet-stream';
    const buf = fs.readFileSync(file);
    const headers = { 'Content-Type': type };
    if (p.startsWith('/assets/') || p.startsWith('/fonts/')) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['Cache-Control'] = 'no-cache';
    }
    const accepts = String(req.headers['accept-encoding'] || '');
    if (COMPRESSIBLE.test(type) && buf.length > 1024 && accepts.includes('gzip')) {
      const gz = zlib.gzipSync(buf, { level: 6 });
      headers['Content-Encoding'] = 'gzip';
      headers['Content-Length'] = gz.length;
      headers.Vary = 'Accept-Encoding';
      res.writeHead(200, headers);
      return res.end(gz);
    }
    headers['Content-Length'] = buf.length;
    res.writeHead(200, headers);
    res.end(buf);
  })
  .listen(PORT, () => console.log('serve-gzip tren http://127.0.0.1:' + PORT + ' (API -> ' + API_TARGET + ')'));
