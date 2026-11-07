const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { all, tx } = require('../common/db');
const { requireScoped, scopedList, assertBusinessScope, setBusinessScope, resolveResourceDept } = require('../common/scope');
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

// Phase 3: tickets theo resource_dept (cskh xem het ticket; sales chi thay
// ticket cua khach minh).
router.get('/cskh/tickets', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'tickets',
      'SELECT t.* FROM tickets t ORDER BY t.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/cskh/tickets', requirePerm('tickets.write'), async (req, res) => {
  try {
    // Phase 3 + GOV-01: ghi resource_dept + audit trong CUNG transaction.
    const { writeAudit } = require('../common/audit');
    const out = await tx(async (c) => {
      const t = await hd.createTicket(c, {
        customer_id: req.body.customer_id || null, category: req.body.category || 'easy',
        subject: req.body.subject || null, content: req.body.content,
        priority: req.body.priority || 'normal', actor: req.user.username,
      });
      // Phase 3: ticket thuoc phong ban cua KH (fallback cskh).
      const dept = await resolveResourceDept(c, 'tickets', { customerId: req.body.customer_id || null });
      await setBusinessScope(c, 'tickets', t.id, dept || 'cskh');
      return t;
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.patch('/cskh/tickets/:id', requirePerm('tickets.write'), async (req, res) => {
  try {
    // Phase 3 (P0-4): IDOR — doi URL id ticket cua phong ban khac.
    await assertBusinessScope(null, req.user, 'tickets', req.params.id);
    // P1-14: mutation trong tx (audit cung tx — INV-2).
    const out = await tx((conn) => hd.setTicket(conn, req.params.id, { status: req.body.status, assignee: req.body.assignee ?? null }, req.user.username));
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.get('/cskh/sla', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'tickets',
      'SELECT t.id, t.code, t.priority, t.sla_due FROM tickets t WHERE t.status IN (\'open\',\'processing\') AND t.sla_due IS NOT NULL AND t.sla_due < CURRENT_TIMESTAMP ORDER BY t.sla_due');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.get('/cskh/csat', requireScoped('orders.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'ratings',
      'SELECT r.stars FROM ratings r');
    const avg = rows.length ? Math.round((rows.reduce((s, r) => s + Number(r.stars || 0), 0) / rows.length) * 100) / 100 : 0;
    return ok(res, { avg, count: rows.length });
  } catch (e) { return fail(res, e); }
});
router.post('/ratings', requirePerm('tickets.write'), async (req, res) => {
  try {
    // Phase 3 (P0-4): rating chi gan voi don/ticket TRONG scope.
    if (req.body.order_id) await assertBusinessScope(null, req.user, 'orders', req.body.order_id);
    if (req.body.ticket_id) await assertBusinessScope(null, req.user, 'tickets', req.body.ticket_id);
    const { writeAudit } = require('../common/audit');
    const out = await tx(async (c) => {
      const r = await hd.addRating(c, {
        customer_id: req.body.customer_id, order_id: req.body.order_id || null,
        ticket_id: req.body.ticket_id || null, stars: req.body.stars,
        comment: req.body.comment || null, actor: req.user.username,
      });
      await setBusinessScope(c, 'ratings', r.id, 'cskh');
      return r;
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

module.exports = router;
