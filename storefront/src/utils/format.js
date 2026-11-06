// utils/format.js — Format tieng Viet. QUAN TRONG: dung Intl.NumberFormat CACHE,
// khong tao moi moi lan render.
//
// Vấn đề đo được (scripts/cpu-profile.cjs, CPU throttling 4x):
//   `Number(x).toLocaleString('vi-VN')` tao MOT Intl.NumberFormat moi O LAN GOC
//   moi ~ 40–80us tren may nay. ProductCard render 12 the -> 24 lan (gia + gia goc)
//   -> ~242ms self-time trong `PriceTag` (nhin duoi day: function `ze` trong bundle).
//   Day la nguon lon nhat cua "Script Evaluation" (608ms) -> TBT > 200ms.
//
// Cách sửa: tao Intl.NumberFormat 1 LAN o module scope, dung lai cho moi so.
//   `Intl.NumberFormat` la stateless & reusable -> dung chung an toan.
const VND = new Intl.NumberFormat('vi-VN');

export function fmtNumber(n) {
  return VND.format(Number(n || 0));
}

export function fmtVND(n) {
  return fmtNumber(n) + 'đ';
}

export function norm(s = '') {
  return String(s).toLowerCase().normalize('NFD')
    .replace(/[đ]/g, 'd').replace(/[Đ]/g, 'd')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2));
}
// dem nguoc den 9h sang hom nay (flash-sale combo)
export function flashLeft() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(9, 0, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  const s = Math.floor((end - now) / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${ss}`;
}
