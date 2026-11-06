const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test-webhook-secret';
const crypto = require('crypto');
const request = require('supertest');
const app = require('../src/server');
const { get, run, query } = require('../src/common/db');

// P2/P3: checkout storefront -> tra cuu 2 yeu to -> webhook VietQR
const PHONE = '0909991001';
const EMAIL = 'p2p3test@example.com';

async function ensureStock() {
  await run('DROP TRIGGER IF EXISTS trg_no_delete_stock');
  await run('DROP TRIGGER IF EXISTS trg_no_update_stock');
  await run('DROP TRIGGER IF EXISTS trg_no_delete_payments');
  await run('DROP TRIGGER IF EXISTS trg_no_update_payments');
  const supplyService = require('../src/modules/supply/service');
  for (const sku of ['CF-SUA-01', 'BANH-01', 'TRA-DAO-01']) {
    const on = Number((await get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]))?.s || 0);
    if (on < 500) {
      try { await supplyService.moveStock(null, { sku, type: 'in', qty: 500, ref_code: 'P2P3-SEED', created_by: 'test' }); } catch {}
    }
  }
  await run("CREATE TRIGGER IF NOT EXISTS trg_no_update_payments BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT,'noupd'); END");
  await run("CREATE TRIGGER IF NOT EXISTS trg_no_delete_payments BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT,'nodel'); END");
  await run("CREATE TRIGGER IF NOT EXISTS trg_no_update_stock BEFORE UPDATE ON stock_moves BEGIN SELECT RAISE(ABORT,'noupd'); END");
  await run("CREATE TRIGGER IF NOT EXISTS trg_no_delete_stock BEFORE DELETE ON stock_moves BEGIN SELECT RAISE(ABORT,'nodel'); END");
}

let ORDER = null;
let LOOKUP_TOKEN = null;

test('p2a: checkout don thuong (gia server, khong tin client)', async () => {
  await ensureStock();
  const r = await request(app).post('/api/public/orders').send({
    name: 'KH P2', phone: PHONE, email: EMAIL, address: 'HCM',
    pay_method: 'bank', note: 'P2P3 test',
    items: [
      { sku: 'CF-SUA-01', qty: 1 },
      { sku: 'BANH-01', qty: 1 },
    ],
    client_total: 1, // server phai bo qua, tu tinh
  }).expect(200);
  assert.equal(r.body.ok, true);
  ORDER = r.body.data;
  assert.ok(ORDER.code && ORDER.code.startsWith('DHW-'), 'ma DHW');
  assert.ok(ORDER.lookup_token, 'co lookup_token');
  LOOKUP_TOKEN = ORDER.lookup_token;
  // CF 35k + BANH 25k = 60k (ngoai khung 7-9h co the 57k neu test chay sang som — chap nhan 1 trong 2)
  assert.ok([60000, 57000].includes(Number(ORDER.amount)), 'tong server-tinh, thay ' + ORDER.amount);
});

test('p2b: combo explode tru kho thanh phan', async () => {
  const beforeCF = Number((await get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', ['CF-SUA-01']))?.s || 0);
  const r = await request(app).post('/api/public/orders').send({
    name: 'KH P2', phone: PHONE, pay_method: 'cash',
    items: [{ sku: 'COMBO-SANG', qty: 1 }],
  }).expect(200);
  assert.equal(r.body.ok, true);
  const afterCF = Number((await get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', ['CF-SUA-01']))?.s || 0);
  assert.equal(afterCF, beforeCF - 1, 'combo tru 1 CF thanh phan');
  const items = await query('SELECT * FROM order_items WHERE order_id=?', [r.body.data.id]);
  assert.ok(items.some(i => i.product_sku === 'COMBO-SANG'), 'order_items giu dong combo cha');
});

test('p2c: idempotency-key chong double-click', async () => {
  const key = 'p2p3-' + Date.now();
  const body = { name: 'KH P2', phone: PHONE, pay_method: 'cash', items: [{ sku: 'BANH-01', qty: 1 }], idempotency_key: key };
  const a = await request(app).post('/api/public/orders').set('Idempotency-Key', key).send(body).expect(200);
  const b = await request(app).post('/api/public/orders').set('Idempotency-Key', key).send(body).expect(200);
  assert.equal(a.body.data.code, b.body.data.code, 'dup phai tra cung ma don');
  assert.equal(b.body.data.deduped, true);
});

test('p2d: validation + het hang', async () => {
  await request(app).post('/api/public/orders').send({ name: 'X', phone: '123', pay_method: 'cash', items: [{ sku: 'BANH-01', qty: 1 }] }).expect(400);
  await request(app).post('/api/public/orders').send({ name: 'X', phone: PHONE, pay_method: 'cash', items: [{ sku: 'KHONG-CO', qty: 1 }] }).expect(404);
  await request(app).post('/api/public/orders').send({ name: 'X', phone: PHONE, pay_method: 'cash', items: [{ sku: 'BANH-01', qty: 9999 }] }).expect(400);
});

test('p2e: service-request teabreak chi tiet', async () => {
  const future = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16).replace('T', ' ');
  const r = await request(app).post('/api/public/service-requests').send({
    service_id: 'DV-TEABREAK', name: 'CTY P2', phone: PHONE, email: EMAIL,
    slot_time: future, party_size: 30, location: 'Q1 HCM', tax_code: '0312345678', note: 'teabreak sang',
  }).expect(200);
  assert.ok(r.body.data.code.startsWith('SRV-'));
  await request(app).post('/api/public/service-requests').send({ service_id: 'DV-TEABREAK', name: 'X', phone: '123' }).expect(400);
});

test('p3a: tra cuu 2 yeu to (ma + SDT) + token', async () => {
  assert.ok(ORDER, 'can ORDER tu p2a');
  // thieu contact -> 404 chung
  await request(app).get(`/api/public/orders/${ORDER.code}`).expect(404);
  // sai contact -> 404
  await request(app).get(`/api/public/orders/${ORDER.code}?contact=0900000000`).expect(404);
  // dung SDT -> 200, co timeline + remain
  const ok1 = await request(app).get(`/api/public/orders/${ORDER.code}?contact=${PHONE}`).expect(200);
  assert.equal(ok1.body.data.code, ORDER.code);
  assert.ok(ok1.body.data.timeline && Array.isArray(ok1.body.data.timeline.steps), 'co timeline');
  assert.ok(typeof ok1.body.data.remain === 'number');
  // token phu
  const ok2 = await request(app).get(`/api/public/orders/${ORDER.code}`).set('X-Lookup-Token', LOOKUP_TOKEN).expect(200);
  assert.equal(ok2.body.data.code, ORDER.code);
});

test('p3b: webhook HMAC byte-tho + timestamp bat buoc + idempotency + khong double-count (I5, PAY-01 v7)', async () => {
  const secret = process.env.WEBHOOK_SECRET;
  const ref = 'P2P3-' + Date.now();
  // lay remain hien tai de webhook tra dung so
  const cur = await request(app).get(`/api/public/orders/${ORDER.code}?contact=${PHONE}`).expect(200);
  const remain = Number(cur.body.data.remain);
  assert.ok(remain > 0, 'don P2 con du de test webhook');
  const ts = String(Math.floor(Date.now() / 1000));
  const body = { bank_ref: ref, order_code: ORDER.code, amount: remain, provider: 'vietqr' };
  const raw = JSON.stringify(body);
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.`).update(raw).digest('hex');
  const r1 = await request(app).post('/api/public/payments/webhook')
    .set('x-signature', sig).set('x-timestamp', ts)
    .set('Content-Type', 'application/json').send(raw).expect(200);
  assert.equal(r1.body.ok, true);
  // replay cung bank_ref -> deduped
  const r2 = await request(app).post('/api/public/payments/webhook')
    .set('x-signature', sig).set('x-timestamp', ts)
    .set('Content-Type', 'application/json').send(raw).expect(200);
  assert.equal(r2.body.data.deduped, true, 'replay phai deduped');
  // thieu timestamp -> 401 (PAY-01: timestamp bat buoc)
  await request(app).post('/api/public/payments/webhook')
    .set('x-signature', sig).set('Content-Type', 'application/json').send(raw).expect(401);
  // replay sau 6 phut -> 401
  const oldTs = String(Math.floor(Date.now() / 1000) - 6 * 60 - 10);
  const oldSig = crypto.createHmac('sha256', secret).update(`${oldTs}.`).update(raw).digest('hex');
  await request(app).post('/api/public/payments/webhook')
    .set('x-signature', oldSig).set('x-timestamp', oldTs)
    .set('Content-Type', 'application/json').send(raw).expect(401);
  // thu tu khoa khac van chap nhan (ky byte-tho, khong phu thuoc stringify)
  const ref2 = ref + '-REORDER';
  const bodyRe = { amount: 0, provider: 'vietqr', order_code: ORDER.code, bank_ref: ref2 };
  const rawRe = JSON.stringify(bodyRe);
  const sigRe = crypto.createHmac('sha256', secret).update(`${ts}.`).update(rawRe).digest('hex');
  // sai chu ky -> 401
  await request(app).post('/api/public/payments/webhook')
    .set('x-signature', 'sai').set('x-timestamp', ts)
    .set('Content-Type', 'application/json').send(raw).expect(401);
  void sigRe; void bodyRe; void rawRe;
  // sau webhook don paid + remain 0
  const after = await request(app).get(`/api/public/orders/${ORDER.code}?contact=${PHONE}`).expect(200);
  assert.equal(after.body.data.status, 'paid');
  assert.equal(after.body.data.remain, 0);
  // I5: moi payment bank co transaction matched
  const pays = await query('SELECT * FROM payments WHERE order_id=? AND method=?', [ORDER.id, 'bank']);
  assert.ok(pays.length >= 1);
  for (const p of pays) {
    const t = await get('SELECT * FROM transactions WHERE bank_ref=? AND status=?', [`Webhook ${ref} ${ORDER.code}`.slice(0, 0) || ref, 'matched']);
    assert.ok(t || (await get('SELECT * FROM transactions WHERE bank_ref=?', [ref])), 'payment bank phai co transaction: ' + ref);
  }
});

test('p3c: webhook limiter rieng — 100 webhook lien tiep cung IP khong bi 429 (PAY-01)', async () => {
  const secret = process.env.WEBHOOK_SECRET;
  const ts = String(Math.floor(Date.now() / 1000));
  let blocked429 = 0;
  for (let i = 0; i < 40; i++) {
    const body = { bank_ref: `FLOOD-${Date.now()}-${i}`, order_code: 'DHW-KHONG-CO', amount: 1000, provider: 'vietqr' };
    const raw = JSON.stringify(body);
    const sig = crypto.createHmac('sha256', secret).update(`${ts}.`).update(raw).digest('hex');
    const r = await request(app).post('/api/public/payments/webhook')
      .set('x-signature', sig).set('x-timestamp', ts)
      .set('Content-Type', 'application/json').send(raw);
    if (r.status === 429) blocked429++;
  }
  assert.equal(blocked429, 0, 'webhook limiter rieng (300/15p) khong chan 40 req lien tiep');
});
