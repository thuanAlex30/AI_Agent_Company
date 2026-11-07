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
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
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

module.exports = {
  applySecurity, loginLimiter, apiLimiter, publicLimiter, chatLimiter,
  clientIp, clientSignature, publicKey, resolveTrustProxy,
};