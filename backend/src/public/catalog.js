const express = require('express');
const { ok, fail, AppError } = require('../common/errors');
const { all, get, norm } = require('../common/db');
const { publicLimiter } = require('./limiters');
const { resolvePrice } = require('./price');

const router = express.Router();
// SEC-03/PAY-01 FIX v7: limiter GAN THEO ROUTE (khong router.use) — tranh dem lan route khac cung mount /api/public
const __lim = publicLimiter;

function pubProduct(row, stock, priceInfo) {
  return {
    sku: row.sku, slug: row.slug || row.sku, name: row.name,
    price: priceInfo.price, price_rule: priceInfo.rule_id,
    unit: row.unit, badge: row.badge || null,
    category: row.category || 'cafe', is_combo: !!row.is_combo,
    description: row.description || null,
    images: (() => { try { return JSON.parse(row.images_json || '[]'); } catch { return []; } })(),
    stock: stock > 0 ? 'in_stock' : 'out_of_stock',
    sort_order: row.sort_order || 0,
  };
}

async function onhand(sku) {
  const r = await get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [sku]);
  return Number(r?.s || 0);
}

// combo stock = min(floor(child_stock / qty)) — tru kho theo thanh phan
async function comboStock(parentSku) {
  const parts = await all('SELECT * FROM product_combos WHERE parent_sku=?', [parentSku]);
  if (!parts.length) return null;
  let m = Infinity;
  for (const p of parts) {
    const s = await onhand(p.child_sku);
    m = Math.min(m, Math.floor(s / Number(p.qty)));
  }
  return m === Infinity ? 0 : m;
}

async function stockOf(row) {
  if (row.is_combo) {
    const cs = await comboStock(row.sku);
    if (cs != null) return cs;
  }
  return onhand(row.sku);
}

// GET /api/public/products?page&limit&search&category&sort
router.get('/products', __lim, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const category = (req.query.category || '').trim();
    const sort = (req.query.sort || 'sort').trim();
    const search = (req.query.search || '').trim();
    const channel = (req.query.channel || 'web').trim();

    let rows = await all("SELECT * FROM products WHERE COALESCE(is_published,1)=1 ORDER BY sort_order, name");
    if (category) rows = rows.filter(r => (r.category || 'cafe') === category);
    if (search) {
      const qn = norm(search);
      const qw = qn.split(' ').filter(Boolean);
      rows = rows.filter(r => {
        const hay = norm(`${r.name} ${r.sku} ${r.slug || ''} ${r.description || ''}`);
        return qw.every(w => hay.includes(w));
      });
    }
    if (sort === 'price_asc' || sort === 'price_desc') {
      const withP = [];
      for (const r of rows) withP.push({ r, p: (await resolvePrice(r.sku, r.price, channel)).price });
      withP.sort((a, b) => sort === 'price_asc' ? a.p - b.p : b.p - a.p);
      rows = withP.map(x => x.r);
    } else if (sort === 'new') rows = rows.slice().reverse();

    const total = rows.length;
    const items = [];
    for (const r of rows.slice((page - 1) * limit, page * limit)) {
      const st = await stockOf(r);
      const pr = await resolvePrice(r.sku, r.price, channel);
      items.push(pubProduct(r, st, pr));
    }
    res.set('Cache-Control', 'public, max-age=60');
    return ok(res, { items, meta: { page, limit, total } });
  } catch (e) { return fail(res, e); }
});

router.get('/products/:slug', __lim, async (req, res) => {
  try {
    const slug = String(req.params.slug || '').slice(0, 64);
    const channel = (req.query.channel || 'web').trim();
    const row = await get(
      'SELECT * FROM products WHERE (slug=? OR sku=?) AND COALESCE(is_published,1)=1',
      [slug, slug]
    );
    if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay san pham', 404);
    const st = await stockOf(row);
    const pr = await resolvePrice(row.sku, row.price, channel);
    const out = pubProduct(row, st, pr);
    if (row.is_combo) {
      const parts = await all('SELECT * FROM product_combos WHERE parent_sku=?', [row.sku]);
      out.combo_items = parts;
    }
    res.set('Cache-Control', 'public, max-age=60');
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

router.get('/services', __lim, async (req, res) => {
  try {
    const rows = await all('SELECT id, code, name, type, price, unit, description, sort_order FROM services WHERE COALESCE(is_published,1)=1 ORDER BY sort_order, id');
    res.set('Cache-Control', 'public, max-age=60');
    return ok(res, { items: rows });
  } catch (e) { return fail(res, e); }
});

router.get('/services/:id', __lim, async (req, res) => {
  try {
    const id = req.params.id;
    const row = await get(
      'SELECT id, code, name, type, price, unit, description FROM services WHERE (id=? OR code=?) AND COALESCE(is_published,1)=1',
      [id, id]
    );
    if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay dich vu', 404);
    res.set('Cache-Control', 'public, max-age=60');
    return ok(res, row);
  } catch (e) { return fail(res, e); }
});

router.get('/banners', __lim, async (req, res) => {
  try {
    const rows = await all('SELECT slug, title, image_url, link, sort_order FROM banners WHERE COALESCE(is_active,1)=1 ORDER BY sort_order, id');
    res.set('Cache-Control', 'public, max-age=60');
    return ok(res, { items: rows });
  } catch (e) { return fail(res, e); }
});

router.get('/promotions', __lim, async (req, res) => {
  try {
    const { businessDayVN } = require('../common/db');
    const today = businessDayVN();
    const rows = await all('SELECT code, title, description, start_date, end_date FROM promotions WHERE COALESCE(is_active,1)=1 AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?) ORDER BY id DESC', [today, today]);
    res.set('Cache-Control', 'public, max-age=60');
    return ok(res, { items: rows });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
