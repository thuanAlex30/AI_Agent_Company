const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { all } = require('../common/db');
const { chatLimiter } = require('../common/security');
const hd = require('../modules/helpdesk/service');

const router = express.Router();
router.use(authenticate);

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3100';
const cfgKeys = require('../config');
const AGENT_KEY = cfgKeys.AGENT_INTERNAL_KEY;

// POST /api/cskh/chat -> proxy sang agent_svc (HTTP, port 3100).
// Backend giu auth + RBAC + rate-limit; agent giu rule-engine + RAG + guardrail.
router.post('/cskh/chat', requirePerm('chat.write'), chatLimiter, async (req, res) => {
  try {
    const r = await fetch(AGENT_URL + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-key': AGENT_KEY },
      body: JSON.stringify({
        message: req.body.message || '',
        phone: req.body.phone || null,
        otp: req.body.otp || null,
        customer_id: req.body.customer_id || null,
        actor: req.user.username,
      }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) {
      const msg = (body.error && body.error.message) || ('Agent HTTP ' + r.status);
      return fail(res, { status: r.status === 503 ? 503 : 502, code: 'AGENT', message: msg });
    }
    return ok(res, { ...body.data, channel: 'web' });
  } catch (e) {
    return fail(res, { status: 503, code: 'AGENT', message: 'Agent offline: ' + String(e.message).slice(0, 150) });
  }
});
router.get('/cskh/tickets', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM tickets ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/cskh/tickets', requirePerm('tickets.write'), async (req, res) => {
  try {
    return ok(res, await hd.createTicket(null, {
      customer_id: req.body.customer_id || null, category: req.body.category || 'easy',
      subject: req.body.subject || null, content: req.body.content,
      priority: req.body.priority || 'normal', actor: req.user.username,
    }));
  } catch (e) { return fail(res, e); }
});
router.patch('/cskh/tickets/:id', requirePerm('tickets.write'), async (req, res) => {
  try {
    return ok(res, await hd.setTicket(null, req.params.id, { status: req.body.status, assignee: req.body.assignee ?? null }, req.user.username));
  } catch (e) { return fail(res, e); }
});
router.get('/cskh/sla', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await hd.listSLA(null)); }
  catch (e) { return fail(res, e); }
});
router.get('/cskh/csat', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await hd.csat(null)); }
  catch (e) { return fail(res, e); }
});
router.post('/ratings', requirePerm('tickets.write'), async (req, res) => {
  try {
    return ok(res, await hd.addRating(null, {
      customer_id: req.body.customer_id, order_id: req.body.order_id || null,
      ticket_id: req.body.ticket_id || null, stars: req.body.stars,
      comment: req.body.comment || null, actor: req.user.username,
    }));
  } catch (e) { return fail(res, e); }
});

module.exports = router;
