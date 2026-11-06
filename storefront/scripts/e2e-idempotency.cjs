// scripts/e2e-idempotency.cjs — E2E: gui 5 LAN cung 1 Idempotency-Key,
// xac nhan CHI TAO DUNG 1 DON (spec §7.3 — "sinh 1 Idempotency-Key cho moi
// luot dat... cho gui lai cung khoa tranh tao don trung").
//
//   node scripts/e2e-idempotency.cjs [baseUrl]
const http = require('http');
const crypto = require('crypto');

const BASE = process.argv[2] || 'http://127.0.0.1:3000';
const ATTEMPTS = 5;

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': data.length } : {}),
          ...headers,
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(buf); } catch {}
          resolve({ status: res.statusCode, body: parsed, raw: buf });
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  // Lay 1 mon co ton kho
  const cat = await req('GET', '/api/public/products?limit=20');
  const items = cat.body && cat.body.data && cat.body.data.items;
  if (!items || !items.length) throw new Error('khong lay duoc san pham');
  const pick = items.find((p) => !p.is_combo) || items[0];

  const key = 'e2e-' + crypto.randomBytes(12).toString('hex');
  const payload = {
    name: 'Khach E2E',
    phone: '0912345678',
    address: '123 Duong Test',
    pay_method: 'cash',
    items: [{ sku: pick.sku, qty: 1 }],
  };

  console.log('SKU:', pick.sku);
  console.log('Idempotency-Key:', key);
  console.log('So lan gui:', ATTEMPTS);
  console.log('');

  const results = [];
  for (let i = 1; i <= ATTEMPTS; i++) {
    const r = await req('POST', '/api/public/orders', payload, { 'Idempotency-Key': key });
    const d = (r.body && r.body.data) || {};
    results.push({ i, status: r.status, code: d.code, id: d.id, deduped: !!d.deduped });
    console.log(
      `  lan ${i}: HTTP ${r.status}  code=${d.code || '-'}  id=${d.id || '-'}  deduped=${d.deduped ? 'YES' : 'no'}` +
        (r.status >= 400 ? '  err=' + JSON.stringify(r.body).slice(0, 120) : '')
    );
  }

  const codes = [...new Set(results.map((r) => r.code).filter(Boolean))];
  const ids = [...new Set(results.map((r) => r.id).filter(Boolean))];
  const okStatuses = results.every((r) => r.status === 200 || r.status === 201);

  console.log('\nKET QUA');
  console.log('  Ma don duy nhat:', codes.join(', ') || '(khong co)');
  console.log('  Id don duy nhat :', ids.join(', ') || '(khong co)');
  console.log('  So don distinct :', codes.length, '(mong doi = 1)');

  const pass = okStatuses && codes.length === 1 && ids.length === 1 && results.filter((r) => !r.deduped).length === 1;
  console.log('\n' + (pass ? 'PASS: 5 lan gui -> CHI 1 don duoc tao.' : 'FAIL: van co >1 don hoac loi HTTP.'));

  // Don do tao (khong phai dedup) la don duy nhat -> xac nhan DB
  const created = results.filter((r) => !r.deduped);
  if (created.length === 1 && created[0].code) {
    const look = await req('GET', '/api/public/orders/' + created[0].code);
    console.log('Xac nhan don trong DB:', JSON.stringify(look.body).slice(0, 200));
  }
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error('LOI:', e.message); process.exit(1); });
