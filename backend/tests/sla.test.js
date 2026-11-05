const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const hd = require('../src/modules/helpdesk/service');

test('sla1: urgent ~+2h, high ~+4h (gio lich)', async () => {
  const base = new Date('2026-11-05T08:00:00Z');
  const parseUTC = (s) => new Date(String(s).replace(' ', 'T') + 'Z');
  const u = parseUTC(hd.slaDue('urgent', base));
  const h = parseUTC(hd.slaDue('high', base));
  assert.ok(Math.abs((u - base) / 3600000 - 2) < 0.05, 'urgent phai +2h');
  assert.ok(Math.abs((h - base) / 3600000 - 4) < 0.05, 'high phai +4h, khong phai 8h');
});

test('sla2: reopen tang reopen_count (FCR) + listSLA dung VIEW SLA_BREACH', async () => {
  const t = await hd.createTicket(null, { content: 'test sla ' + Date.now(), priority: 'normal', actor: 'test' });
  await hd.setTicket(null, t.id, { status: 'processing' }, 'test');
  await hd.setTicket(null, t.id, { status: 'resolved' }, 'test');
  const r = await hd.setTicket(null, t.id, { status: 'open' }, 'test');
  assert.equal(r.reopen_count, 1);
  const sla = await hd.listSLA(null);
  assert.ok(Array.isArray(sla));
});

test('sla3: thieu stars -> 400, thieu order/ticket -> 400 (cam rating nhap)', async () => {
  await assert.rejects(() => hd.addRating(null, { customer_id: 1, stars: null }), (e) => e.status === 400);
  await assert.rejects(() => hd.addRating(null, { customer_id: 1, stars: 5 }), (e) => e.status === 400 && /order_id|ticket_id/.test(e.message));
});
