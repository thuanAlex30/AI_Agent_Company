// public/limiters.js — limiter rieng cho API public storefront.
//
// SEC-03 (b): Storefront la website CONG KHAI. Moi khach truy cap tu cung IP
// (coffee shop wifi, mobile carrier NAT, van phong) se CHUNG 1 bucket -> het
// quota nham 429 cho tat ca khach. Vi vay:
//   1. KHONG dung chung bucket voi ERP noi bo (server.js bo qua apiLimiter
//      cho /api/public).
//   2. Key = IP + signature (User-Agent + Accept-Language) -> tach moi
//      thiet bi dung chung IP.
//   3. Ngan sach rong hon API noi bo (trai nghiem cong khai, nhieu luot moi).
const rateLimit = require('express-rate-limit');
const { publicKey } = require('../common/security');

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => publicKey(req),
});
// Dat don: gioi han rieng (30/15p) — tranh spam don + ton kho.
const publicOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => publicKey(req),
});
// Chat public: 10/5p.
const publicChatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => publicKey(req),
});
// Tra cuu don: 60/15p.
const publicLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => publicKey(req),
});
// PAY-01 FIX v7: webhook co limiter RIENG, rong (Ngan Hang/aggregator gui don)
// — khong dung chung publicOrderLimiter.
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => publicKey(req),
});

module.exports = { publicLimiter, publicOrderLimiter, publicChatLimiter, publicLookupLimiter, webhookLimiter };
