const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const request = require('supertest');
const app = require('../src/server');

// US-STOREFRONT-01: public read-only catalog (P1)

test('pub1: GET /api/public/products tra 4 mon, khong lo cost/ton so', async () => {
  const r = await request(app).get('/api/public/products').expect(200);
  assert.equal(r.body.ok, true);
  const items = r.body.data.items;
  assert.ok(items.length >= 4, 'phai co >=4 SP publish, thay ' + items.length);
  for (const it of items) {
    assert.ok(!('cost' in it), 'cam lo cost: ' + it.sku);
    assert.ok(!('stock_qty' in it), 'cam lo ton so');
    assert.ok(['in_stock', 'out_of_stock'].includes(it.stock), 'stock dang nhan: ' + it.sku);
    assert.ok(it.price > 0 && Number.isInteger(it.price), 'gia BIGINT>0');
  }
  const combo = items.find(i => i.sku === 'COMBO-SANG');
  assert.ok(combo, 'phai co COMBO-SANG');
  assert.equal(combo.is_combo, true);
});

test('pub2: search khong dau + filter category + sort gia', async () => {
  const r = await request(app).get('/api/public/products?search=ca%20phe').expect(200);
  assert.ok(r.body.data.items.some(i => i.sku === 'CF-SUA-01'), 'tim khong dau phai ra ca phe');
  const r2 = await request(app).get('/api/public/products?category=tra').expect(200);
  assert.ok(r2.body.data.items.every(i => i.category === 'tra'), 'filter category tra');
  const r3 = await request(app).get('/api/public/products?sort=price_asc').expect(200);
  const ps = r3.body.data.items.map(i => i.price);
  const sorted = [...ps].sort((a, b) => a - b);
  assert.deepEqual(ps, sorted, 'sort gia tang dan');
});

test('pub3: chi tiet slug + combo_items, slug an 404', async () => {
  const r = await request(app).get('/api/public/products/combo-sang').expect(200);
  assert.equal(r.body.data.sku, 'COMBO-SANG');
  assert.ok(Array.isArray(r.body.data.combo_items) && r.body.data.combo_items.length === 2, 'combo co 2 thanh phan');
  await request(app).get('/api/public/products/khong-ton-tai-xyz').expect(404);
});

test('pub4: services + banners + promotions', async () => {
  const s = await request(app).get('/api/public/services').expect(200);
  assert.ok(s.body.data.items.length >= 3, 'phai co >=3 DV');
  assert.ok(s.body.data.items.some(i => i.code === 'DV-TEABREAK'));
  const b = await request(app).get('/api/public/banners').expect(200);
  assert.ok(b.body.data.items.length >= 2, 'phai co >=2 banner');
  const p = await request(app).get('/api/public/promotions').expect(200);
  assert.ok(p.body.data.items.some(i => i.code === 'KM-SANG'));
});

test('pub5: gia theo gio/kenh o server (khong tin client)', async () => {
  const { pickPrice } = require('../src/public/price');
  // web 08:00: rule 32k uu tien hon gia goc 35k
  const a = pickPrice(35000, [{ channel: 'web', start_time: '07:00', end_time: '09:00', price: 32000, priority: 10, id: 1 }], 'web', 8 * 60);
  assert.equal(a.price, 32000);
  // ngoai khung gio -> gia goc
  const b = pickPrice(35000, [{ channel: 'web', start_time: '07:00', end_time: '09:00', price: 32000, priority: 10, id: 1 }], 'web', 12 * 60);
  assert.equal(b.price, 35000);
  // kenh store khong ap rule web
  const c = pickPrice(35000, [{ channel: 'web', start_time: null, end_time: null, price: 32000, priority: 10, id: 1 }], 'store', 8 * 60);
  assert.equal(c.price, 35000);
});

test('pub6: phan trang + meta', async () => {
  const r = await request(app).get('/api/public/products?page=1&limit=2').expect(200);
  assert.equal(r.body.data.items.length, 2);
  assert.ok(r.body.data.meta.total >= 4);
  assert.equal(r.body.data.meta.page, 1);
});
