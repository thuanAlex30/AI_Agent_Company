export async function pub(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    const err = new Error((body.error && body.error.message) || ('HTTP ' + res.status));
    err.code = body.error && body.error.code;
    err.status = res.status;
    throw err;
  }
  return body.data;
}

export const getProducts = (q = '') => pub('/api/public/products' + (q ? `?${q}` : ''));
export const getProduct = (slug) => pub(`/api/public/products/${slug}`);
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
  pub(`/api/public/orders/${encodeURIComponent(code)}?contact=${encodeURIComponent(contact)}`);
export const lookupByToken = (code, token) =>
  pub(`/api/public/orders/${encodeURIComponent(code)}`, { headers: { 'X-Lookup-Token': token } });
export const postChat = (body) =>
  pub('/api/public/chat', { method: 'POST', body: JSON.stringify(body) });
