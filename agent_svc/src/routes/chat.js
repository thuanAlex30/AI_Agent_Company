const express = require('express');
const rateLimit = require('express-rate-limit');
const { ok, fail } = require('../errors');
const cskh = require('../brain/cskh');
const pub = require('../brain/public');

const router = express.Router();

const isTest = process.env.NODE_ENV === 'test';
const limitHandler = (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMIT', message: 'Qua nhieu request, thu lai sau' } });
const publicLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: isTest ? 200 : 10, standardHeaders: true, legacyHeaders: false, handler: limitHandler });

function checkKey(req, res, next) {
  const want = process.env.AGENT_INTERNAL_KEY || 'dev-agent-key';
  if (req.headers['x-agent-key'] !== want) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH', message: 'Agent key khong hop le' } });
  }
  return next();
}

// POST /public-chat — kênh công khai storefront (key riêng + limiter riêng, trước checkKey nội bộ)
// Chỉ đọc knowledge_public + giá bán published; cấm cost/lương/tồn số.
router.post('/public-chat', publicLimiter, async (req, res) => {
  try {
    const want = process.env.AGENT_PUBLIC_KEY || process.env.AGENT_INTERNAL_KEY || 'dev-agent-key';
    if (req.headers['x-agent-key'] !== want) {
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
