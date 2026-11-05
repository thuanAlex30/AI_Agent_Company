export async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
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

export function fmtVND(n) {
  return Number(n || 0).toLocaleString('vi-VN') + 'd';
}

export function timeLeft(due) {
  if (!due) return '';
  const diff = new Date(due) - new Date();
  const d = Math.ceil(diff / 86400000);
  if (d < 0) return 'quá hạn ' + Math.abs(d) + ' ngày';
  if (d === 0) return 'hết hạn hôm nay';
  return 'còn ' + d + ' ngày';
}

export function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2));
}
