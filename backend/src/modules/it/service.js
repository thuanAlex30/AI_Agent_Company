const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { insertedId } = require('../../common/db');

// P2-21: IT_FLOW — bang transition (khong phai mang ke).
// Nguon: docs/contract/state-machines.md
//   open -> fixing|closed ; fixing -> resolved|closed ; resolved -> closed|open ; closed -> open
const IT_FLOW = {
  open:     ['fixing', 'closed'],
  fixing:   ['resolved', 'closed'],
  resolved: ['closed', 'open'],
  closed:   ['open'],
};

/** Chuyen trang thai incident — nem VALIDATION 400 neu khong hop le. */
function assertIncidentTransition(from, to) {
  const f = String(from || '').trim();
  const t = String(to || '').trim();
  if (f === t) return;
  if (!(IT_FLOW[f] || []).includes(t)) {
    throw new AppError('VALIDATION', `Chuyen incident ${f}->${t} khong hop le`, 400);
  }
}

// it so huu: it_incidents
async function list(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  return c.query('SELECT * FROM it_incidents ORDER BY id DESC LIMIT 200');
}
async function create(conn, { code, title, severity = 'p3', actor = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!code || !title) throw new AppError('VALIDATION', 'Incident can code + title', 400);
  if (!['p1', 'p2', 'p3', 'p4'].includes(severity)) throw new AppError('VALIDATION', 'severity khong hop le', 400);
  const r = await c.run("INSERT INTO it_incidents(code,title,severity,status) VALUES(?,?,?,'open')", [code, title, severity]);
  const id = insertedId(r, 'it_incidents');
  await writeAudit(c, actor || 'system', 'create', 'it_incidents', id, null, { code, severity });
  return { id, code };
}
async function setStatus(conn, id, { status, mttr_min = null }, actor) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!Object.keys(IT_FLOW).includes(status)) throw new AppError('VALIDATION', 'status incident khong hop le', 400);
  const old = await c.get('SELECT * FROM it_incidents WHERE id=?', [id]);
  if (!old) throw new AppError('NOT_FOUND', 'Khong tim thay incident', 404);
  // P2-21: state machine — chuyen sai => 400, KHONG update lech.
  assertIncidentTransition(old.status, status);
  await c.run('UPDATE it_incidents SET status=?, mttr_min=COALESCE(?,mttr_min) WHERE id=?', [status, mttr_min, id]);
  await writeAudit(c, actor || 'system', 'update', 'it_incidents', id, { status: old.status }, { status });
  return { id, status };
}
async function health(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const open = await c.get("SELECT COUNT(*) c FROM it_incidents WHERE status IN ('open','fixing')");
  const p1 = await c.get("SELECT COUNT(*) c FROM it_incidents WHERE severity='p1' AND status IN ('open','fixing')");
  const mttr = await c.get('SELECT AVG(mttr_min) a FROM it_incidents WHERE mttr_min IS NOT NULL');
  // uptime uoc tinh (ghi chu ro): tru 0.1% moi p1 mo + 0.01% moi incident mo
  const uptime = Math.max(90, 100 - Number(p1?.c || 0) * 0.5 - Number(open?.c || 0) * 0.05);
  return { open: Number(open?.c || 0), p1_open: Number(p1?.c || 0), mttr_min: mttr?.a ? Math.round(Number(mttr.a)) : null, uptime_estimate: Math.round(uptime * 100) / 100, note: 'uptime uoc tinh tu incidents (khong phai monitoring that)' };
}
module.exports = { list, create, setStatus, health, IT_FLOW, assertIncidentTransition };
