// api.js — lớp gọi API cho ERP frontend.
//
// Phase 5 (P1-13 + bổ sung):
//   - Refresh token TỰ ĐỘNG: khi access token hết hạn (401) và backend
//     còn refresh cookie => refresh 1 lần rồi retry request gốc.
//   - HÀNG ĐỢI: nhiều request cùng lúc gặp 401 => CHỈ 1 lệnh refresh
//     được chạy, các request còn lại chờ cùng promise (`refreshing`).
//   - CSRF: đọc cookie `csrf_token` (KHÔNG httpOnly) và gửi kèm header
//     `X-CSRF-Token` cho mọi request.
//   - Idempotency-Key được GIỮ NGUYÊN qua vòng retry (không sinh lại).

/** Đọc cookie `csrf_token` (cookie KHÔNG httpOnly nên JS đọc được). */
export function readCsrf() {
  if (typeof document === 'undefined' || !document.cookie) return '';
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/** Ghi cookie `csrf_token` từ response body (sau login/refresh). */
export function writeCsrf(token) {
  if (!token || typeof document === 'undefined') return;
  const maxAge = 7 * 24 * 3600; // cùng TTL với refresh cookie
  document.cookie = `csrf_token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}; samesite=${cookieSameSite()}`;
}

function cookieSameSite() {
  const isProd = typeof location !== 'undefined' && location.protocol === 'https:';
  return isProd ? 'none' : 'lax';
}

/**
 * Refresh dùng chung cho mọi request đang chờ.
 * `null` = chưa có refresh nào đang chạy.
 */
let refreshing = null;

/** Refresh 1 lần; trả `true` nếu thành công (có access token mới). */
export async function tryRefresh() {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(readCsrf() ? { 'X-CSRF-Token': readCsrf() } : {}),
      },
      body: '{}',
    })
      .then(async (r) => {
        if (!r.ok) return false;
        const body = await r.json().catch(() => ({}));
        if (!body.ok) return false;
        if (body.data && body.data.csrf_token) writeCsrf(body.data.csrf_token);
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

/**
 * Gọi API.
 * @param {string} path
 * @param {object} opts  { method, body, headers, ... }
 * @param {boolean} _retry  (nội bộ) cho phép retry 1 lần sau khi refresh.
 */
export async function api(path, opts = {}, _retry = true) {
  const csrf = readCsrf();
  const res = await fetch(path, {
    // `...opts` PHẢI đặt TRƯỚC để `headers`/`credentials` của ta merge đúng;
    // nếu đặt sau thì `opts.headers` sẽ ghi đè mất header CSRF.
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(opts.headers || {}),
    },
  });

  // Access token het han -> refresh 1 lan roi retry (GIU NGUYEN Idempotency-Key).
  if (res.status === 401 && _retry && !path.startsWith('/api/auth/')) {
    const okRefresh = await tryRefresh();
    if (okRefresh) return api(path, opts, false);
    window.dispatchEvent(new CustomEvent('auth:expired'));
    const err = new Error('Phi dang nhap da het, vui long dang nhap lai');
    err.status = 401;
    err.code = 'AUTH_EXPIRED';
    throw err;
  }

  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    const err = new Error((body.error && body.error.message) || ('HTTP ' + res.status));
    err.code = body.error && body.error.code;
    err.status = res.status;
    throw err;
  }
  return body.data;
}

/**
 * Upload file (multipart/form-data) — CSRF + refresh + retry giong `api`.
 * KHONG tu dat `Content-Type` (browser tu them boundary).
 */
export async function apiUpload(path, formData, opts = {}, _retry = true) {
  const csrf = readCsrf();
  const res = await fetch(path, {
    ...opts,
    method: opts.method || 'POST',
    credentials: 'include',
    headers: {
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(opts.headers || {}),
    },
    body: formData,
  });
  if (res.status === 401 && _retry && !path.startsWith('/api/auth/')) {
    if (await tryRefresh()) return apiUpload(path, formData, opts, false);
    window.dispatchEvent(new CustomEvent('auth:expired'));
    const err = new Error('Phi dang nhap da het, vui long dang nhap lai');
    err.status = 401;
    err.code = 'AUTH_EXPIRED';
    throw err;
  }
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
