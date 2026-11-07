const fs = require('fs');
const path = require('path');
const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');

let matrixCache = null;
function loadMatrix() {
  if (!matrixCache) {
    // approvals.js nam o src/modules/governance -> ROOT cach 3 cap
    matrixCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs/contract/approval-matrix.json'), 'utf8'));
  }
  return matrixCache;
}

function levelForAmount(amount) {
  const rules = loadMatrix().amount_routing.expense_po;
  for (const r of rules) {
    if (r.lt != null && Number(amount) < r.lt) return r.level;
    if (r.gte != null && Number(amount) >= r.gte) return r.level;
  }
  return 'ceo';
}

/**
 * INV-6: nguong duyet HOP DONG lay TU approval-matrix.json (khong hardcode).
 * Doc `amount_routing.contract` neu co; fallback `expense_po` + nguong legal.
 */
function levelForContract(amount) {
  const m = loadMatrix();
  const routing = (m.amount_routing && m.amount_routing.contract) || m.amount_routing.expense_po;
  for (const r of routing) {
    if (r.lt != null && Number(amount) < r.lt) return r.level;
    if (r.gte != null && Number(amount) >= r.gte) return r.level;
  }
  return 'ceo';
}

function needsLegal(refType, amount, note) {
  if (refType !== 'contract') return false;
  if (Number(amount) >= 50000000) return true;
  return /rui ro|phap ly|kien/i.test(note || '');
}

// title -> level nguoi nay co the duyet (covers)
function userLevel(employeeTitle, role) {
  const t = String(employeeTitle || '').toLowerCase();
  const r = String(role || '').toLowerCase();
  if (r === 'owner' || t.includes('owner')) return 'board';
  if (r === 'ceo' || t.includes('ceo')) return 'ceo';
  if (r === 'cfo' || t.includes('cfo')) return 'cfo';
  if (r === 'director' || t.includes('director') || t.includes('giam doc')) return 'director';
  if (r === 'manager' || t.includes('manager')) return 'manager';
  if (r === 'leader' || t.includes('leader') || t.includes('truong')) return 'leader';
  if (r === 'legal') return 'legal';
  return null;
}

function canDecide(deciderLevel, requiredLevel) {
  if (requiredLevel === 'legal') return deciderLevel === 'legal';
  const covers = (loadMatrix().levels[deciderLevel] || {}).covers || [];
  return covers.includes(requiredLevel);
}

async function requestApproval(conn, { ref_type, ref_id, requester, level = null, note = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!['contract', 'purchase_order', 'expense', 'leave', 'discount'].includes(ref_type)) {
    throw new AppError('VALIDATION', 'ref_type khong hop le', 400);
  }
  let lv = level;
  if (!lv) {
    if (ref_type === 'expense' || ref_type === 'purchase_order') {
      const tbl = ref_type === 'expense' ? 'expenses' : 'purchase_orders';
      const row = await c.get(`SELECT * FROM ${tbl} WHERE id=?`, [ref_id]);
      if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay chung tu', 404);
      lv = levelForAmount(Number(row.amount));
    } else {
      lv = 'manager';
    }
  }
  if (lv === 'director/cfo') throw new AppError('VALIDATION', 'Level director/cfo gop bi cam (dung cfo)', 400);
  const r = await c.run(
    'INSERT INTO approvals(ref_type,ref_id,requester,level,status,note) VALUES(?,?,?,?,?,?)',
    [ref_type, ref_id, requester, lv, 'pending', note]
  );
  const id = r.lastInsertRowid || (await c.get('SELECT id FROM approvals WHERE ref_type=? AND ref_id=? ORDER BY id DESC LIMIT 1', [ref_type, ref_id]))?.id;
  await writeAudit(c, String(requester), 'create', 'approvals', id, null, { ref_type, ref_id, level: lv });
  return { id, level: lv };
}

async function decideApproval(conn, approvalId, { decider, decision, note = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const ap = await c.get('SELECT * FROM approvals WHERE id=?', [approvalId]);
  if (!ap) throw new AppError('NOT_FOUND', 'Khong tim thay approval', 404);
  if (ap.status !== 'pending') throw new AppError('VALIDATION', 'Approval da quyet, cam chuyen tiep', 400);
  if (Number(ap.requester) === Number(decider)) {
    throw new AppError('FORBIDDEN', 'Requester khong duoc tu duyet (ke ca CEO)', 403);
  }
  if (!['approved', 'rejected'].includes(decision)) throw new AppError('VALIDATION', 'decision phai approved/rejected', 400);
  // xac dinh level cua decider qua employees.title / users.role
  const decUser = await c.get('SELECT * FROM users WHERE id=?', [decider]);
  if (!decUser) throw new AppError('NOT_FOUND', 'Khong tim thay nguoi duyet', 404);
  let title = null;
  if (decUser.employee_code) {
    const emp = await c.get('SELECT * FROM employees WHERE code=?', [decUser.employee_code]);
    title = emp?.title;
  }
  const dl = userLevel(title, decUser.role);
  if (!dl) throw new AppError('FORBIDDEN', `Vai ${decUser.role} khong co quyen duyet`, 403);
  if (!canDecide(dl, ap.level)) {
    throw new AppError('FORBIDDEN', `Level ${dl} khong duoc duyet buoc ${ap.level}`, 403);
  }
  await c.run('UPDATE approvals SET status=?, decided_by=?, decided_at=CURRENT_TIMESTAMP, note=? WHERE id=?', [decision, decider, note, approvalId]);
  await writeAudit(c, String(decider), 'update', 'approvals', approvalId, { status: 'pending' }, { status: decision });

  // day trang thai chung tu khi du dieu kien
  await propagateApproval(c, ap, decision, String(decider));
  return { id: approvalId, status: decision };
}

async function propagateApproval(c, ap, decision, actor) {
  if (decision !== 'approved') {
    // rejected -> danh dau chung tu rejected/cancelled nhe
    if (ap.ref_type === 'contract') await c.run("UPDATE contracts SET status='rejected' WHERE id=?", [ap.ref_id]);
    if (ap.ref_type === 'purchase_order') await c.run("UPDATE purchase_orders SET status='rejected' WHERE id=?", [ap.ref_id]);
    return;
  }
  if (ap.ref_type === 'contract') {
    const ct = await c.get('SELECT * FROM contracts WHERE id=?', [ap.ref_id]);
    if (!ct) return;
    const rows = await c.query("SELECT * FROM approvals WHERE ref_type='contract' AND ref_id=? AND status='approved'", [ap.ref_id]);
    const levels = rows.map((r) => r.level);
    const needMain = Number(ct.amount) >= 50000000 ? 'ceo' : 'manager';
    const matrix = loadMatrix();
    const mainOk = levels.some((l) => ((matrix.levels[l] || {}).covers || []).includes(needMain));
    const legalOk = !needsLegal('contract', ct.amount, ct.code) ? true : levels.includes('legal');
    // Kiem tra note rui ro tren approvals note hoac contract: don gian check note cua approval
    const allNotes = rows.map((r) => r.note || '').join(' ');
    const riskInNote = /rui ro|phap ly|kien/i.test(allNotes);
    const legalOk2 = riskInNote ? levels.includes('legal') : legalOk;
    if (mainOk && legalOk2 && ct.status !== 'signed') {
      await c.run("UPDATE contracts SET status='signed' WHERE id=?", [ap.ref_id]);
      await writeAudit(c, actor, 'update', 'contracts', ap.ref_id, { status: ct.status }, { status: 'signed' });
      // mo khoa orders pending_approval theo contract nay
      await c.run("UPDATE orders SET status='pending' WHERE contract_id=? AND status='pending_approval'", [ap.ref_id]);
    } else if (ct.status === 'draft' || ct.status === 'pending_approval') {
      await c.run("UPDATE contracts SET status='pending_approval' WHERE id=?", [ap.ref_id]);
    }
  }
  if (ap.ref_type === 'purchase_order') {
    const po = await c.get('SELECT * FROM purchase_orders WHERE id=?', [ap.ref_id]);
    if (po && (po.status === 'draft' || po.status === 'pending_approval')) {
      await c.run("UPDATE purchase_orders SET status='approved' WHERE id=?", [ap.ref_id]);
      await writeAudit(c, actor, 'update', 'purchase_orders', ap.ref_id, { status: po.status }, { status: 'approved' });
    }
  }
  // expense: khong doi status (payments tu check approval)
}

module.exports = { requestApproval, decideApproval, levelForAmount, levelForContract, needsLegal, userLevel, canDecide };
