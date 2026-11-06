export function fmtVND(n) {
  return Number(n || 0).toLocaleString('vi-VN') + 'đ';
}
export function norm(s = '') {
  return String(s).toLowerCase().normalize('NFD')
    .replace(/[đ]/g, 'd').replace(/[Đ]/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
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
