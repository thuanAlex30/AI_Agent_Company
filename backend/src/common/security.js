const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

/**
 * SEC-03: proxy trust dung topology.
 *
 * Truoc day: app.set('trust proxy', 1) bat buon -> backend tin X-Forwarded-For
 * do CLIENT gui. Neu backend publish truc tiep ra internet (khong qua proxy
 * nao), attacker gia "X-Forwarded-For: 1.2.3.4" de moi request co IP khac
 * -> bypass rate-limit (SEC-PROXY-001).
 *
 * Quy tac moi:
 *   - Backend KHONG public truc tiep (docker-compose bind 127.0.0.1).
 *     Nginx/ERP/Storefront la proxy duy nhat.
 *   - TRUST_PROXY (env):
 *       'loopback' (mac dinh) — chi tin proxy o 127.0.0.1/::1
 *       '1' | <so>            — tin N hop proxy (chi khi co reverse proxy that)
 *       'false'               — khong tin proxy nao (direct internet)
 *   - Rate-limit key: luon lay IP "hop cuoi" ma server tin, KHONG lay thang
 *     tu X-Forwarded-For raw.
 */
function resolveTrustProxy() {
  const raw = String(process.env.TRUST_PROXY || 'loopback').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'none') return false;
  if (raw === 'true' || raw === '1') return 1;
  if (raw === 'loopback') return 'loopback';
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return n;
  return 'loopback';
}

function applySecurity(app) {
  app.set('trust proxy', resolveTrustProxy());
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], objectSrc: ["'none'"] } } }));
  const whitelist = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim());
  app.use(cors({ origin: (origin, cb) => {
    if (!origin || whitelist.includes(origin)) return cb(null, true);
    return cb(null, false);
  }, credentials: true }));
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
}

// Rate-limit key: IP da qua proxy-trust cua Express (req.ip).
// KHONG dung x-forwarded-for raw (client gia duoc).
function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// --- SEC-03 (b) + UX storefront ---------------------------------------------
// Storefront la website CONG KHAI: moi khach truy cap tu cung IP (coffee
// shop wifi, mobile carrier NAT, van phong) se chung 1 bucket -> het quota
// nham 429 cho TAT CA khach. Rate-limit public API theo IP + "signature"
// (User-Agent + accept-language) de tach moi thiet bi, va tao bucket RIENG
// cho storefront public (khong dung chung bucket voi ERP noi bo).
function clientSignature(req) {
  const ua = String(req.headers['user-agent'] || '').slice(0, 120);
  const lang = String(req.headers['accept-language'] || '').slice(0, 40);
  let h = 0;
  const s = ua + '|' + lang;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
  return h.toString(36);
}

function publicKey(req) {
  return clientIp(req) + ':' + clientSignature(req);
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
});
// ERP noi bo: 300 req / 15p / IP (nho).
// BO SUNG (SEC-03 b): KHONG ap cho /api/public — storefront public co
// limiter rieng trong `public/limiters.js` (va bucket rieng cho khach
// dung chung wifi/NAT). Neu ap ca 2, storefront het quota ERP truoc.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
  skip: (req) => String(req.originalUrl || '').startsWith('/api/public'),
});
// API public storefront (dung o server.js truoc public/limiters.js): bucket
// rieng + khoa theo IP+signature (khach dung chung wifi van khong bi 429).
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => publicKey(req),
});
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
});

// --- Phase 2 (P1-14): rate-limit rieng cho refresh ---------------------------
// Refresh la endpoint nhay cam: attacker co refresh token bi lo (hoac token
// cu bi replay) se spam /api/auth/refresh de thu xoay vong lien tuc.
// 10 req / 15 phút / IP.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => clientIp(req),
});

// --- Phase 2 (P1-15): rate-limit theo USERNAME cho login ---------------------
// Chi khoa theo IP thi attacker co nhieu IP (botnet/proxy) van brute-force
// duoc 1 tai khoan. Khoa them theo username -> chan concentrated brute-force.
const loginUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => {
    const u = String((req.body && req.body.username) || '').trim().toLowerCase().slice(0, 64);
    return 'u:' + (u || 'unknown');
  },
  skipSuccessfulRequests: true,
});

// ---------------------------------------------------------------------------
// Phase 2 (P1-16): CSRF guard (double-submit cookie).
//
// Backend dung httpOnly cookie cho access/refresh token. SameSite=Lax chan
// cross-site POST o tang trinh duyet, NHUNG khong phu la 100% (vd: subdomain
// cung-site, trinh duyet cu, reverse proxy dung lai domain). => them double
// -submit cookie: FE doc cookie `csrf_token` (KHONG httpOnly) va gui header
// `X-CSRF-Token`; backend so sanh.
//
// EXEMPT (khong yeu cau CSRF):
//   - GET/HEAD/OPTIONS (khong phai mutation)
//   - /api/public/* (webhook, storefront, khong dung cookie session)
//   - /api/auth/login, /api/auth/refresh (chua co session)
//   - request co Authorization: Bearer (khong dung cookie)
// ---------------------------------------------------------------------------
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = [/^\/api\/public\//, /^\/api\/auth\/login$/, /^\/api\/auth\/refresh$/];

// CSRF_ENABLED=0 tat guard (chi dung cho test/tool CLI).
// Production BAT BUOC bat: fail-fast neu production tat.
const CSRF_ENABLED = (process.env.CSRF_ENABLED || '1') !== '0';
if (process.env.NODE_ENV === 'production' && !CSRF_ENABLED) {
  throw new Error('CSRF_ENABLED=0 khong duoc phep khi NODE_ENV=production (fail-fast)');
}

function csrfGuard(req, res, next) {
  if (!CSRF_ENABLED) return next();
  if (CSRF_SAFE_METHODS.has(req.method)) return next();
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (CSRF_EXEMPT_PATHS.some((re) => re.test(path))) return next();
  // Bearer token => khong phai cookie session => CSRF khong ap dung.
  if (/^Bearer\s+\S+/i.test(req.headers.authorization || '')) return next();

  const cookieToken = (req.cookies && req.cookies.csrf_token) || '';
  const headerToken = req.headers['x-csrf-token'] || '';
  if (!cookieToken || !headerToken) {
    return next(new (require('./errors').AppError)('FORBIDDEN', 'Thieu CSRF token', 403));
  }
  // So sanh thoi gian hang (timing-safe) de khong lo thong tin qua timing.
  const a = Buffer.from(String(cookieToken));
  const b = Buffer.from(String(headerToken));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new (require('./errors').AppError)('FORBIDDEN', 'CSRF token khong hop le', 403));
  }
  return next();
}

/** Sinh CSRF token ngau nhien (hex 32 bytes). */
function newCsrfToken() { return crypto.randomBytes(32).toString('hex'); }

module.exports = {
  applySecurity, loginLimiter, apiLimiter, publicLimiter, chatLimiter,
  refreshLimiter, loginUserLimiter, csrfGuard, newCsrfToken, CSRF_ENABLED,
  clientIp, clientSignature, publicKey, resolveTrustProxy,
};