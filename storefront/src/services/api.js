// services/api.js — B1 chuyen sang lop HTTP dung chung (services/http.js)
// - timeout 10s, retry toi da 2 lan CHO GET (backoff 500ms/1500ms), POST khong retry
// - cache in-memory TTL 60s cho GET (products/services/banners/promotions)
// - KHONG cache don hang / tra cuu (tra cuu di qua header X-Lookup-Token)
// - giu nguyên hop dong /api/public/* — khong doi ten ham cho phia goi
import { request, clearCache } from './http.js';

export { clearCache as clearPubCache };

export async function pub(path, opts = {}) {
  return request(path, opts);
}

export const getProducts = (q = '') => pub('/api/public/products' + (q ? `?${q}` : ''));
export const getProduct = (slug) => pub(`/api/public/products/${encodeURIComponent(slug)}`);

// Batch chi tiet (gio hang/checkout): gom N sku thanh 1 lan goi catalog + loc client -> tranh N+1 waterfall
export async function getProductsBySkus(skus = []) {
  const uniq = [...new Set((skus || []).filter(Boolean))].slice(0, 20);
  if (!uniq.length) return new Map();
  const d = await getProducts('limit=50');
  const map = new Map();
  for (const p of (d.items || [])) map.set(p.sku, p);
  // SKU chua co trong page 1 -> fetch rieng tung cai con thieu
  const missing = uniq.filter((s) => !map.has(s));
  await Promise.all(missing.map(async (s) => {
    try { const p = await getProduct(s); map.set(p.sku || s, p); } catch {}
  }));
  return map;
}
export const getServices = () => pub('/api/public/services').then((d) => d.items || d);
export const getBanners = () => pub('/api/public/banners').then((d) => d.items || d);
export const getPromos = () => pub('/api/public/promotions').then((d) => d.items || d);
export const postOrder = (body, key) =>
  pub('/api/public/orders', {
    method: 'POST',
    headers: key ? { 'Idempotency-Key': key } : {},
    body: JSON.stringify(body),
  });
export const postServiceReq = (body) =>
  pub('/api/public/service-requests', { method: 'POST', body: JSON.stringify(body) });
export const lookupOrder = (code, contact) =>
  pub(`/api/public/orders/${encodeURIComponent(code.trim())}?contact=${encodeURIComponent((contact || '').trim())}`);
export const lookupByToken = (code, token) =>
  pub(`/api/public/orders/${encodeURIComponent(code.trim())}`, { headers: { 'X-Lookup-Token': (token || '').trim() } });
export const postChat = (body) =>
  pub('/api/public/chat', { method: 'POST', body: JSON.stringify(body) });
