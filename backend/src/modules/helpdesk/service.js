const fs = require('fs');
const path = require('path');
const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');

function loadSlaHours() {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs/contract/manifest.json'), 'utf8'));
  return m.conventions.sla_hours;
}

function slaDue(priority, base = new Date()) {
  const h = loadSlaHours()[priority] ?? loadSlaHours().normal;
  return new Date(base.getTime() + h * 3600000).toISOString().slice(0, 19).replace('T', ' ');
}

let tckSeq = 0;
async function createTicket(conn, { customer_id = null, category = 'easy', subject = null, content, priority = 'normal', actor = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!content) throw new AppError('VALIDATION', 'Ticket can content', 400);
  if (!['easy', 'technical', 'legal', 'complaint', 'policy_inquiry'].includes(category)) throw new AppError('VALIDATION', 'category khong hop le', 400);
  if (!['low', 'normal', 'high', 'urgent'].includes(priority)) throw new AppError('VALIDATION', 'priority khong hop le', 400);
  tckSeq += 1;
  const code = `TCK-${String(Date.now()).slice(-6)}${tckSeq}`;
  const due = slaDue(priority);
  const r = await c.run(
    'INSERT INTO tickets(code,customer_id,category,subject,content,status,priority,sla_due) VALUES(?,?,?,?,?,?,?,?)',
    [code, customer_id, category, subject, content, 'open', priority, due]
  );
  const id = r.lastInsertRowid || (await c.get('SELECT id FROM tickets WHERE code=?', [code]))?.id;
  await writeAudit(c, actor || 'system', 'create', 'tickets', id, null, { code, priority });
  return { id, code, sla_due: due };
}

const TICKET_FLOW = { open: ['processing', 'closed'], processing: ['resolved', 'closed'], resolved: ['open', 'closed'] };

async function setTicket(conn, id, { status, assignee = null }, actor) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const t = await c.get('SELECT * FROM tickets WHERE id=?', [id]);
  if (!t) throw new AppError('NOT_FOUND', 'Khong tim thay ticket', 404);
  if (!(TICKET_FLOW[t.status] || []).includes(status)) throw new AppError('VALIDATION', `Chuyen ${t.status}->${status} khong hop le`, 400);
  const patch = { status };
  if (status === 'processing' && !t.first_response_at) patch.first_response_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (status === 'resolved') patch.resolved_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (status === 'open' && t.status === 'resolved') patch.reopen_count = Number(t.reopen_count || 0) + 1;
  if (status === 'open' && t.status === 'resolved') patch.resolved_at = null;
  const sets = ['status=?'];
  const params = [status];
  if (patch.first_response_at) { sets.push('first_response_at=?'); params.push(patch.first_response_at); }
  if (patch.resolved_at !== undefined) { sets.push('resolved_at=?'); params.push(patch.resolved_at); }
  if (patch.reopen_count !== undefined) { sets.push('reopen_count=?'); params.push(patch.reopen_count); }
  if (assignee != null) { sets.push('assignee=?'); params.push(assignee); }
  params.push(id);
  await c.run(`UPDATE tickets SET ${sets.join(',')} WHERE id=?`, params);
  await writeAudit(c, actor || 'system', 'update', 'tickets', id, { status: t.status }, { status });
  return { id, status, reopen_count: patch.reopen_count ?? t.reopen_count };
}

async function listSLA(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  return c.query('SELECT id, code, priority, sla_due FROM tickets WHERE status IN (\'open\',\'processing\') AND sla_due IS NOT NULL AND sla_due < CURRENT_TIMESTAMP ORDER BY sla_due');
}

async function csat(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const r = await c.get('SELECT AVG(stars) avg, COUNT(*) c FROM ratings');
  return { avg: r?.avg ? Math.round(Number(r.avg) * 100) / 100 : 0, count: Number(r?.c || 0) };
}

async function addRating(conn, { customer_id, order_id = null, ticket_id = null, stars, comment = null, actor = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (stars == null) throw new AppError('VALIDATION', 'stars bat buoc (cam rating nhap)', 400);
  if (!Number.isInteger(Number(stars)) || Number(stars) < 1 || Number(stars) > 5) throw new AppError('VALIDATION', 'stars 1-5', 400);
  if (!customer_id) throw new AppError('VALIDATION', 'customer_id bat buoc', 400);
  if (!order_id && !ticket_id) throw new AppError('VALIDATION', 'can order_id hoac ticket_id', 400);
  const cust = await c.get('SELECT * FROM customers WHERE id=?', [customer_id]);
  if (!cust) throw new AppError('NOT_FOUND', 'Khong tim thay khach hang', 404);
  const r = await c.run('INSERT INTO ratings(customer_id,order_id,ticket_id,stars,comment) VALUES(?,?,?,?,?)', [customer_id, order_id, ticket_id, stars, comment]);
  const id = r.lastInsertRowid || (await c.get('SELECT id FROM ratings ORDER BY id DESC LIMIT 1'))?.id;
  await writeAudit(c, actor || 'system', 'create', 'ratings', id, null, { customer_id, stars });
  return { id };
}

module.exports = { createTicket, setTicket, listSLA, csat, addRating, slaDue, TICKET_FLOW };
