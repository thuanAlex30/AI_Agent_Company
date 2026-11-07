const fs = require('fs');
const path = require('path');
const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { insertedId, nowISO } = require('../../common/db');

let matrixCache = null;
function loadMatrix() {
  if (!matrixCache) {
    // approvals.js nam o src/modules/governance -> ROOT cach 3 cap
    matrixCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs/contract/approval-matrix.json'), 'utf8'));
  }
  return matrixCache;
}

// P1-6 / INV-6: nguong duyet LUON doc tu approval-matrix.json (1 nguon suy nhat).
// `expense_po` cho chi phi/PO; `contract` cho hop dong.
function routingFor(refType) {
  const m = loadMatrix();
  const r = m.amount_routing || {};
  if (refType === 'contract' && Array.isArray(r.contract)) return r.contract;
  if (Array.isArray(r.expense_po)) return r.expense_po;
  return [];
}

function levelForAmount(amount, refType = 'expense_po') {
  const rules = routingFor(refType);
  for (const r of rules) {
    if (r.lt != null && Number(amount) < r.lt) return r.level;
    if (r.gte != null && Number(amount) >= r.gte) return r.level;
  }
  return 'ceo';
}

/**
 * INV-6: nguong duyet HOP DONG lay TU approval-matrix.json (khong hardcode).
 * Doc `amount_routing.contract` neu co; fallback `expense_po`.
 */
function levelForContract(amount) {
  return levelForAmount(amount, 'contract');
}

/**
 * INV-6: cap duyet BO SUNG (ngoai cap chinh) cho 1 loai chung tu.
 *
 * Nguon: `amount_routing.contract_extra_legal` trong approval-matrix.json:
 *   { "add": "legal", "if": "amount>=50000000 OR note ~ rui ro|phap ly|kien" }
 *
 * Cap chinh (ceo/manager) va cap bo sung (legal) la 2 approval RIENG BIET —
 * contract chi `signed` khi ca 2 deu approved (xem propagateApproval).
 * Client duoc phep yeu cau cap bo sung (neu dung dieu kien) nhan KHONG duoc
 * yeu cau cap chinh KHAC nguong da tinh.
 */
function extraLevelsFor(refType, amount, note) {
  const m = loadMatrix();
  const r = m.amount_routing || {};
  const rule = r.contract_extra_legal;
  if (!rule || !rule.add) return [];
  if (refType !== 'contract') return [];
  if (!contractExtraLegalApplies(amount, note, rule)) return [];
  return [rule.add];
}

/** Dieu kien `if` cua `contract_extra_legal`: amount>=X OR note ~ regex. */
function contractExtraLegalApplies(amount, note, rule) {
  const cond = String(rule.if || '');
  const amtMatch = cond.match(/amount\s*>=\s*(\d+)/);
  if (amtMatch && Number(amount) >= Number(amtMatch[1])) return true;
  const reMatch = cond.match(/note\s*~\s*(.+)$/);
  if (reMatch) {
    const src = reMatch[1].trim();
    try {
      if (new RegExp(src, 'i').test(String(note || ''))) return true;
    } catch { /* regex khong hop le -> bo qua */ }
  }
  return false;
}

/**
 * P1-6: hop dong can duyet legal theo `amount_routing.contract_extra_legal`
 * trong approval-matrix.json (khong hardcode nguong).
 * `note` phai la NOTE THUC (khong phai ma chung tu).
 */
function needsLegal(refType, amount, note) {
  return extraLevelsFor(refType, amount, note).includes('legal');
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

// P1-6: KHONG tin `level` tu client — LUON tinh tu approval-matrix.json.
// Client gui `level` khac cap that => 400 (khong throw 500).
async function requestApproval(conn, { ref_type, ref_id, requester, requester_username = null, level = null, note = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!['contract', 'purchase_order', 'expense', 'leave', 'discount'].includes(ref_type)) {
    throw new AppError('VALIDATION', 'ref_type khong hop le', 400);
  }
  // P1-6: chi ref_type co bang tien moi tu dong xep cap duoc.
  const tbl = ref_type === 'expense' ? 'expenses'
    : ref_type === 'purchase_order' ? 'purchase_orders'
      : ref_type === 'contract' ? 'contracts'
        : ref_type === 'discount' ? 'quotes' : null;
  if (!tbl) throw new AppError('VALIDATION', `ref_type ${ref_type} chua ho tro tu dong xep cap`, 400);
  const row = await c.get(`SELECT * FROM ${tbl} WHERE id=?`, [ref_id]);
  if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay chung tu', 404);

  // P1-6: cap duyet LUON tu matrix — KHONG tin client.
  const amount = Number(row.amount || 0);
  const lv = (ref_type === 'expense' || ref_type === 'purchase_order')
    ? levelForAmount(amount, 'expense_po')
    : (ref_type === 'contract' ? levelForContract(amount) : levelForAmount(amount, 'expense_po'));

  if (level && level !== lv && !(extraLevelsFor(ref_type, amount, note) || []).includes(level)) {
    throw new AppError('VALIDATION', `Cap duyet bat buoc cho ${ref_type} la '${lv}', khong cho ep cap '${level}'`, 400);
  }
  if (lv === 'director/cfo') throw new AppError('VALIDATION', 'Level director/cfo gop bi cam (dung cfo)', 400);
  // Cap duyet cuoi cung: cap chinh (tu matrix) hoac cap bo sung (legal).
  const finalLevel = (level && level !== lv && (extraLevelsFor(ref_type, amount, note) || []).includes(level))
    ? level : lv;
  const r = await c.run(
    'INSERT INTO approvals(ref_type,ref_id,requester,level,status,note) VALUES(?,?,?,?,?,?)',
    [ref_type, ref_id, requester, finalLevel, 'pending', note]
  );
  const id = insertedId(r, 'approvals');
  await writeAudit(c, String(requester_username || requester), 'create', 'approvals', id, null, { ref_type, ref_id, level: finalLevel, note });
  return { id, level: finalLevel };
}
    
/**
 * P1-7: khoa dong + chong double-decide.
 *   - `c.lock(...)` => SELECT ... FOR UPDATE tren PG.
 *   - `UPDATE ... WHERE id=? AND status='pending'` => chi 1 request ghi duoc.
 *   - `decided_at` dung `nowISO()` (chuuan hoa INV-5) thay vi CURRENT_TIMESTAMP.
 */
async function decideApproval(conn, approvalId, { decider, decider_username = null, decision, note = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  return db.tx(async (tc) => {
    const ap = await tc.lock('SELECT * FROM approvals WHERE id=?', [approvalId]);
    if (!ap) throw new AppError('NOT_FOUND', 'Khong tim thay approval', 404);
    if (ap.status !== 'pending') throw new AppError('VALIDATION', 'Approval da quyet, cam chuyen tiep', 400);
    if (Number(ap.requester) === Number(decider)) {
      throw new AppError('FORBIDDEN', 'Requester khong duoc tu duyet (ke ca CEO)', 403);
    }
     if (!['approved', 'rejected'].includes(decision)) throw new AppError('VALIDATION', 'decision phai approved/rejected', 400);
    // xac dinh level cua decider qua employees.title / users.role
    const decUser = await tc.get('SELECT * FROM users WHERE id=?', [decider]);
    if (!decUser) throw new AppError('NOT_FOUND', 'Khong tim thay nguoi duyet', 404);
    let title = null;
    if (decUser.employee_code) {
      const emp = await tc.get('SELECT * FROM employees WHERE code=?', [decUser.employee_code]);
      title = emp?.title;
    }
    const dl = userLevel(title, decUser.role);
     if (!dl) throw new AppError('FORBIDDEN', `Vai ${decUser.role} khong co quyen duyet`, 403);
    if (!canDecide(dl, ap.level)) {
      throw new AppError('FORBIDDEN', `Level ${dl} khong duoc duyet buoc ${ap.level}`, 403);
    }
    // P1-7: conditional update — chi 1 request duoc quyet.
    const up = await tc.run(
      "UPDATE approvals SET status=?, decided_by=?, decided_at=?, note=? WHERE id=? AND status='pending'",
      [decision, decider, nowISO(), note, approvalId]
    );
    if (Number(up?.changes || 0) !== 1) {
      throw new AppError('CONFLICT', 'Approval vua bi quyet boi giao dich khac', 409);
    }
    await writeAudit(tc, String(decider_username || decider), 'update', 'approvals', approvalId, { status: 'pending' }, { status: decision });

    // day trang thai chung tu khi dieu kien (CUNG transaction).
    await propagateApproval(tc, ap, decision, String(decider_username || decider));
    return { id: approvalId, status: decision };
  });
}

async function propagateApproval(c, ap, decision, actor) {
  if (decision !== 'approved') {
    // rejected -> danh dau chung tu rejected/cancelled nhe
    if (ap.ref_type === 'contract') await c.run("UPDATE contracts SET status='rejected' WHERE id=?", [ap.ref_id]);
    if (ap.ref_type === 'purchase_order') await c.run("UPDATE purchase_orders SET status='rejected' WHERE id=?", [ap.ref_id]);
    return;
  }
  if (ap.ref_type === 'contract') {
    // P1-9: khoa dong hop dong truoc khi cap nhat trang thai.
    const ct = typeof c.lock === 'function'
      ? (await c.lock('SELECT * FROM contracts WHERE id=?', [ap.ref_id]))
      : await c.get('SELECT * FROM contracts WHERE id=?', [ap.ref_id]);
    if (!ct) return;
    const rows = await c.query("SELECT * FROM approvals WHERE ref_type='contract' AND ref_id=? AND status='approved'", [ap.ref_id]);
    const levels = rows.map((r) => r.level);
    // P1-6: cap chinh dung theo matrix (contract routing).
    const needMain = levelForContract(Number(ct.amount));
    const matrix = loadMatrix();
    const mainOk = levels.some((l) => ((matrix.levels[l] || {}).covers || []).includes(needMain));
    // P1-6: note THAT cua approval (khong phai ma chung tu) quyet dinh legal.
    const allNotes = rows.map((r) => r.note || '').join(' ');
       const riskInNote = /rui ro|phap ly|kien/i.test(allNotes);
    const legalNeeded = needsLegal('contract', Number(ct.amount), allNotes);
    const legalOk = legalNeeded ? levels.includes('legal') : true;
    if (mainOk && legalOk && ct.status !== 'signed') {
      // P1-6: set signed_date khi chuyen sang 'signed'.
      await c.run("UPDATE contracts SET status='signed', signed_date=? WHERE id=?", [nowISO().slice(0, 10), ap.ref_id]);
      await writeAudit(c, actor, 'update', 'contracts', ap.ref_id, { status: ct.status }, { status: 'signed' });
      // mo khoa orders pending_approval theo contract nay
      await c.run("UPDATE orders SET status='pending' WHERE contract_id=? AND status='pending_approval'", [ap.ref_id]);
    } else if (ct.status === 'draft' || ct.status === 'pending_approval') {
      await c.run("UPDATE contracts SET status='pending_approval' WHERE id=?", [ap.ref_id]);
    }
     }
  if (ap.ref_type === 'purchase_order') {
    const po = typeof c.lock === 'function'
      ? (await c.lock('SELECT * FROM purchase_orders WHERE id=?', [ap.ref_id]))
      : await c.get('SELECT * FROM purchase_orders WHERE id=?', [ap.ref_id]);
    if (po && (po.status === 'draft' || po.status === 'pending_approval')) {
      await c.run("UPDATE purchase_orders SET status='approved' WHERE id=?", [ap.ref_id]);
      await writeAudit(c, actor, 'update', 'purchase_orders', ap.ref_id, { status: po.status }, { status: 'approved' });
    }
  }
  // expense: khong doi status (payments tu check approval)
}
   
module.exports = {
  requestApproval, decideApproval, levelForAmount, levelForContract, needsLegal,
  userLevel, canDecide, routingFor, extraLevelsFor,
};
