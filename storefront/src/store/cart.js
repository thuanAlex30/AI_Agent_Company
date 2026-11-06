// cart store don gian: zustand-like bang localStorage + event
const KEY = 'bizops-cart-v1';
function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event('bizops-cart'));
}
export function getCart() { return load(); }
export function cartCount() { return load().reduce((s, i) => s + Number(i.qty || 0), 0); }
export function addToCart(sku, qty = 1) {
  const items = load();
  const ex = items.find((i) => i.sku === sku);
  if (ex) ex.qty = Math.min(100, ex.qty + qty);
  else items.push({ sku, qty });
  save(items);
}
export function setQty(sku, qty) {
  let items = load();
  if (qty <= 0) items = items.filter((i) => i.sku !== sku);
  else {
    const ex = items.find((i) => i.sku === sku);
    if (ex) ex.qty = qty;
  }
  save(items);
}
export function clearCart() { save([]); }
export function useCartTick(setTick) {
  window.addEventListener('bizops-cart', () => setTick((t) => t + 1));
}
