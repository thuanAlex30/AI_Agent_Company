const express = require('express');
const rateLimit = require('express-rate-limit');
const cfg = require('../config');
const { ok, fail } = require('../errors');
const cskh = require('../brain/cskh');
const pub = require('../brain/public');

const router = express.Router();

const isTest = process.env.NODE_ENV === 'test';
const limitHandler = (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMIT', message: 'Qua nhieu request, thu lai sau' } });
// AVAIL-01 FIX v7: gioi han theo IP THAT cua khach (backend gui x-client-ip),
// khong gom moi khach thanh 1 IP backend. Chi an toan khi :3100 khong public (xem SEC-02).
// Dong thoi gioi han dong thoi de chong flood 1 client.
let concurrent = 0;
const MAX_CONCURRENT = 50;
const publicLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: isTest ? 200 : 10, standardHeaders: true, legacyHeaders: false, handler: limitHandler,
  keyGenerator: (req) => String(req.headers['x-client-ip'] || req.ip || 'unknown').slice(0, 64),
});
function concurrentGuard(req, res, next) {
  if (concurrent >= MAX_CONCURRENT) return limitHandler(req, res);
  concurrent++;
  res.on('finish', () => { concurrent = Math.max(0, concurrent - 1); });
  return next();
}

function checkKey(req, res, next) {
  if (!cfg.checkInternalKey(req.headers['x-agent-key'])) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH', message: 'Agent key khong hop le' } });
  }
  return next();
}

// POST /public-chat — kênh công khai storefront (key riêng + limiter riêng, trước checkKey nội bộ)
// Chỉ đọc knowledge_public + giá bán published; cấm cost/lương/tồn số.
router.post('/public-chat', concurrentGuard, publicLimiter, async (req, res) => {
  try {
    if (!cfg.checkPublicKey(req.headers['x-agent-key'])) {
      return res.status(401).json({ ok: false, error: { code: 'AUTH', message: 'Agent key khong hop le' } });
    }
    const out = await pub.publicChatReply(null, {
      message: String(req.body.message || '').slice(0, 500),
      contact: req.body.contact || null,
      lookup_token: req.body.lookup_token || null,
      actor: 'public',
    });
    return ok(res, { ...out, channel: 'web' });
  } catch (e) { return fail(res, e); }
});

router.use(checkKey);

// POST /chat — rule-engine + RAG + guardrail (tach tu backend modules/cskh)
router.post('/chat', async (req, res) => {
  try {
    const out = await cskh.chatReply(null, {
      message: req.body.message || '',
      phone: req.body.phone || null,
      otp: req.body.otp || null,
      customer_id: req.body.customer_id || null,
      actor: req.body.actor || 'backend',
    });
    return ok(res, { ...out, channel: 'web' });
  } catch (e) { return fail(res, e); }
});

router.get('/rag', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    return ok(res, cskh.rag(q, 3));
  } catch (e) { return fail(res, e); }
});

module.exports = router;
