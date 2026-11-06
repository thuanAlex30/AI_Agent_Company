// services/http.js — B1 lop HTTP dung chung (spec §7.3)
// - timeout 10s cho moi GET
// - retry TOI DA 2 lan cho GET (backoff 500ms, 1500ms) — POST KHONG tu thu lai
// - AbortController de huy request cu khi doi route/doi tu khoa
// - 429 doc Retry-After → thong bao thanhien; 5xx/mat mang → loi ro rang
// - khong bao gio ghi PII (SDT/email/lookup token) vao console

const BASE = '';
const TIMEOUT_MS = 10000;
const MAX_GET_RETRY = 2;
const BACKOFF_MS = [500, 1500];

const cache = new Map();
const CACHE_TTL = 60000;
const inflight = new Map();

function friendlyError(code, status, msg) {
  if (code === 'RATE_LIMIT') {
    return 'Bạn thao tác hơi nhanh, vui lòng thử lại sau ít phút.';
  }
  if (status === 0) return 'Mạng chậm hoặc mất kết nối. Kiểm tra mạng rồi thử lại.';
  if (status >= 500) return 'Hệ thống đang bận. Thử lại sau ít phút nhé.';
  return msg || 'Có lỗi xảy ra, vui lòng thử lại.';
}

function err(code, status, msg, extra) {
  return Object.assign(new Error(friendlyError(code, status, msg)), {
    code: code || 'UNKNOWN',
    status: status || 0,
    ...(extra || {}),
  });
}

/**
 * @param {string} path
 * @param {{method?:string, body?:any, headers?:object, signal?:AbortSignal, cache?:boolean}} opts
 */
export async function request(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const useCache = isGet && opts.cache !== false;
  const cacheKey = method + ' ' + path;

  // 1. Cache in-memory (stale-while-revalidate don gian)
  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  }
  // 2. Gop request trung lap (tranh N+1)
  if (useCache && inflight.has(cacheKey)) return inflight.get(cacheKey);

  const run = (async () => {
    const retries = isGet ? MAX_GET_RETRY : 0;
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      // Ket noi signal ben ngoai (doi route / doi tu khoa)
      const onAbort = () => controller.abort();
      if (opts.signal) {
        if (opts.signal.aborted) { clearTimeout(timer); throw err('ABORTED', 0, 'Da huy'); }
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        const res = await fetch(BASE + path, {
          method,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(opts.headers || {}),
          },
          ...(opts.body !== undefined ? { body: opts.body } : {}),
        });

        const retryAfter = Number(res.headers.get('Retry-After') || 0);
        const body = await res.json().catch(() => ({}));

        if (res.status === 429) {
          throw err('RATE_LIMIT', 429, body?.error?.message, { retryAfter: retryAfter || null });
        }
        if (!res.ok || body?.ok === false) {
          const code = body?.error?.code || 'HTTP_' + res.status;
          throw err(code, res.status, body?.error?.message);
        }

        const data = body?.data !== undefined ? body.data : body;
        if (useCache) cache.set(cacheKey, { at: Date.now(), data });
        return data;
      } catch (e) {
        // Huy co y dieu -> khong thu lai
        if (e.code === 'ABORTED' || e.name === 'AbortError') throw err('ABORTED', 0, 'Da huy');
        if (e.code === 'RATE_LIMIT' || (e.status >= 400 && e.status < 500)) throw e;
        lastErr = e.code === 'TIMEOUT' || e.name === 'AbortError'
          ? err('TIMEOUT', 0, 'Mạng chậm, thử lại sau')
          : err('NETWORK', 0, 'Không kết nối được máy chủ');
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt] || BACKOFF_MS[BACKOFF_MS.length - 1]));
        }
      } finally {
        clearTimeout(timer);
        if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      }
    }
    throw lastErr || err('UNKNOWN', 0, 'Lỗi không xác định');
  })();

  if (useCache) {
    inflight.set(cacheKey, run);
    run.finally(() => inflight.delete(cacheKey)).catch(() => {});
  }
  return run;
}

export function clearCache() {
  cache.clear();
}
