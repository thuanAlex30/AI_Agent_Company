// cart store: localStorage + cross-tab sync (storage event) + bizops-cart event
const KEY = 'bizops-cart-v1';
const MAX_QTY = 100;
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((i) => i && i.sku) : [];
  } catch { return []; }
}
function save(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('bizops-cart'));
}
export function getCart() { return load(); }
export function cartCount() { return load().reduce((s, i) => s + Number(i.qty || 0), 0); }
export function cartSkus() { return load().map((i) => i.sku); }
export function addToCart(sku, qty = 1) {
  sku = String(sku || '').slice(0, 32);
  qty = Math.max(1, Math.min(MAX_QTY, Number(qty) || 1));
  if (!sku) return;
  const items = load();
  const ex = items.find((i) => i.sku === sku);
  if (ex) ex.qty = Math.min(MAX_QTY, Number(ex.qty || 0) + qty);
  else items.push({ sku, qty });
  save(items);
}
export function setQty(sku, qty) {
  qty = Number(qty) || 0;
  let items = load();
  if (qty <= 0) items = items.filter((i) => i.sku !== sku);
  else {
    const ex = items.find((i) => i.sku === sku);
    if (ex) ex.qty = Math.min(MAX_QTY, Math.max(1, Math.floor(qty)));
  }
  save(items);
}
export function clearCart() { save([]); }
// cross-tab: tab khac doi gio -> cap nhat badge
if (typeof window !== 'undefined' && !window.__bizopsCartSync) {
  window.__bizopsCartSync = true;
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) window.dispatchEvent(new Event('bizops-cart'));
  });
}
export function useCartTick(setTick) {
  window.addEventListener('bizops-cart', () => setTick((t) => t + 1));
}
