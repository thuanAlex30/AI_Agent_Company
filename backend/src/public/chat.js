// public/chat.js — proxy chat public sang agent_svc (giữ key ở server)
const express = require('express');
const { ok, fail } = require('../common/errors');
const { publicChatLimiter } = require('./limiters');

const router = express.Router();
// SEC-03/PAY-01 FIX v7: limiter GAN THEO ROUTE
router.use(express.json({ limit: '50kb' }));

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3100';
const cfgKeys = require('../config');
const AGENT_PUBLIC_KEY = cfgKeys.AGENT_PUBLIC_KEY;

router.post('/chat', publicChatLimiter, async (req, res) => {
  try {
    const message = String(req.body.message || '').slice(0, 500);
    if (!message.trim()) return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'Thieu message' } });
    const r = await fetch(AGENT_URL + '/public-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-key': AGENT_PUBLIC_KEY,
        // AVAIL-01 FIX v7: chuyen IP that cua khach de agent gioi han theo khach,
        // khong de moi khach don thanh 1 IP (backend) lam chan ca website.
        // SEC-03: dung req.ip (da qua proxy-trust) — KHONG tin raw x-forwarded-for.
        'x-client-ip': require('../common/security').clientIp(req),
        'x-request-id': req.requestId || '',
      },
      body: JSON.stringify({
        message,
        lookup_token: req.body.lookup_token || null,
        contact: req.body.contact || null,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) {
      const msg = (body.error && body.error.message) || ('Agent HTTP ' + r.status);
      return fail(res, { status: r.status === 429 ? 429 : 502, code: 'AGENT', message: msg });
    }
    return ok(res, { ...body.data, channel: 'web' });
  } catch (e) {
    return fail(res, { status: 503, code: 'AGENT', message: 'Agent offline: ' + String(e.message).slice(0, 150) });
  }
});

module.exports = router;
