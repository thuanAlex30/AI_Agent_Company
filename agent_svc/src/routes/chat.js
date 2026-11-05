const express = require('express');
const { ok, fail } = require('../errors');
const cskh = require('../brain/cskh');

const router = express.Router();

function checkKey(req, res, next) {
  const want = process.env.AGENT_INTERNAL_KEY || 'dev-agent-key';
  if (req.headers['x-agent-key'] !== want) {
    return res.status(401).json({ ok: false, error: { code: 'AUTH', message: 'Agent key khong hop le' } });
  }
  return next();
}
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
