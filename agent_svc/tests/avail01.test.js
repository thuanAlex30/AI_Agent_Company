// avail01.test.js — AVAIL-01 FIX v7: rate-limit agent phai dem theo IP THAT cua khach,
// khong gom moi khach thanh 1 IP backend (bug goc: ca storefront chi duoc 10 tin / 5 phut).
// Nghiem thu spec: 50 IP x 5 tin -> khong ai bi 429; 1 client x 20 tin -> bi chan dung nguong.
//
// NOTE: file nay chay o NODE_ENV=production (ngoai setup.js) de dung DUNG nguong 10 tin/5 phut
// cua spec. Cac key test da du >= 32 ky tu nen config fail-fast van cho phep.
require('./setup');
process.env.NODE_ENV = 'production';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

const KEY = process.env.AGENT_PUBLIC_KEY;

function postAt(port, ip, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body || { message: 'menu co gi?' });
    const req = http.request({
      host: '127.0.0.1', port, path: '/public-chat', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-key': KEY,
        'x-client-ip': ip,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', () => resolve(0));
    req.write(payload);
    req.end();
  });
}

let appInstance = null;
function getApp() {
  if (!appInstance) appInstance = require('../server');
  return appInstance;
}
function withServer(fn) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer(getApp());
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      try { await fn(port); srv.close(); resolve(); }
      catch (e) { srv.close(); reject(e); }
    });
  });
}

test('avail01a: limiter agent dung x-client-ip (khong phai req.ip)', () => {
  const srcServer = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const srcChat = fs.readFileSync(path.join(__dirname, '..', 'src/routes/chat.js'), 'utf8');

  // 1. Limiter TOAN CUC phai lay x-client-ip
  assert.ok(/x-client-ip/.test(srcServer), 'server.js phai doc x-client-ip cho keyGenerator');
  assert.ok(/keyGenerator/.test(srcServer), 'limiter toan cuc phai co keyGenerator theo IP khach');

  // 2. Route /public-chat phai co keyGenerator theo x-client-ip
  assert.ok(/keyGenerator[\s\S]{0,200}x-client-ip/.test(srcChat), 'route chat phai key theo x-client-ip');

  // 3. Nguong prod 10 tin / 5 phut phai duoc giu nguyen
  assert.ok(/max: isTest \? 200 : 10/.test(srcChat), 'prod giu 5p/10req, test noi long 200');
  assert.ok(/windowMs: 5 \* 60 \* 1000/.test(srcChat), 'cua so 5 phut phai giu nguyen');
});

test('avail01b: 50 IP khac nhau x 5 tin -> khong ai bi 429', async () => {
  await withServer(async (port) => {
    const codes = {};
    for (let i = 0; i < 50; i++) {
      for (let j = 0; j < 5; j++) {
        const c = await postAt(port, `10.0.${i}.1`);
        codes[c] = (codes[c] || 0) + 1;
      }
    }
    const blocked = codes[429] || 0;
    assert.equal(blocked, 0, 'khong client nao bi 429 (thuc te: ' + JSON.stringify(codes) + ')');
    assert.equal(codes[200] || 0, 250, 'ca 250 request deu xu ly (thuc te: ' + JSON.stringify(codes) + ')');
  });
});

test('avail01c: 1 client gui 20 tin lien tiep -> bi chan dung nguong 10/5phut', async () => {
  await withServer(async (port) => {
    const codes = {};
    for (let j = 0; j < 20; j++) {
      const c = await postAt(port, '192.168.5.5');
      codes[c] = (codes[c] || 0) + 1;
    }
    const okCount = codes[200] || 0;
    const blocked = codes[429] || 0;
    assert.equal(okCount, 10, 'dung 10 tin duoc qua truoc khi chan (thuc te: ' + JSON.stringify(codes) + ')');
    assert.equal(blocked, 10, '10 tin sau bi chan dung nguong (thuc te: ' + JSON.stringify(codes) + ')');
  });
});
