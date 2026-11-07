const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { setBusinessScope, resolveResourceDept } = require('../../common/scope');
const { norm, todayVN, sinceVN, businessDayVN, insertedId } = require('../../common/db');

// NOTE: module nay so huu debts/payments/expenses/transactions/reminder_log/budgets.
// Cap nhat trang thai don goi qua salesService.setOrderPaid (khong UPDATE truc tiep bang cua sales).
//
// Phase 1 (P0-1): quy uoc moi cho signature:
//   - `created_by` = ID NGUOI (SO) -> cot BIGINT (created_by)
//   - `actor`      = USERNAME (TEXT) -> audit_log.actor
//   Mac dinh created_by = null (nghiep vu tu dong: cron/webhook/storefront).

function dbConn(conn, fallback) {
  // conn (trong tx) co {query,get,run,lock}; fallback la module db async
  if (conn && typeof conn.get === 'function') return conn;
  return fallback;
}

// TX-03/GOV-01: moi thao tac ghi (payment, receivable, payable...) phai
// chay trong MOT transaction de (a) co row lock (FOR UPDATE) chong race
// so duoc cong no, va (b) audit ghi cung transaction (khong the tach).
async function withTx(fn, conn) {
  const db = require('../../common/db');
  if (conn && typeof conn.run === 'function') return fn(conn);
  return db.tx(fn);
}

async function createReceivable(conn, { customer_id, order_id = null, amount, due_date = null, created_by = null, actor = null, note = null }) {
  return withTx(async (c) => {
    if (!customer_id || !amount || amount <= 0) throw new AppError('VALIDATION', 'Receivable can customer_id + amount>0', 400);
    const r = await c.run(
      'INSERT INTO debts(customer_id,order_id,type,amount,paid,due_date,status,note,created_by) VALUES(?,?,?,?,?,?,\'open\',?,?)',
      [customer_id, order_id, 'receivable', amount, 0, due_date || due7(), note, created_by]
    );
    const id = insertedId(r, 'debts');
    // Phase 3: cong no thuoc phong ban cua don (fallback finance).
    const debtDept = await resolveResourceDept(c, 'debts', { orderId: order_id });
    await setBusinessScope(c, 'debts', id, debtDept);
    await writeAudit(c, actor || 'system', 'create', 'debts', id, null, { customer_id, order_id, amount });
    return { id };
  }, conn);
}

async function createPayable(conn, { order_id = null, amount, due_date = null, created_by = null, actor = null, note = null }) {
  return withTx(async (c) => {
    if (!amount || amount <= 0) throw new AppError('VALIDATION', 'Payable can amount>0', 400);
    const r = await c.run(
      'INSERT INTO debts(customer_id,order_id,type,amount,paid,due_date,status,note,created_by) VALUES(NULL,?,\'payable\',?,0,?,\'open\',?,?)',
      [order_id, amount, due_date || due7(), note, created_by]
    );
    const id = insertedId(r, 'debts');
    // Phase 3: payable thuoc phong ban finance.
    await setBusinessScope(c, 'debts', id, 'finance');
    await writeAudit(c, actor || 'system', 'create', 'debts', id, null, { order_id, amount });
    return { id };
  }, conn);
}

async function markDebtCancelled(conn, orderId, actor) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  const rows = await c.query('SELECT * FROM debts WHERE order_id=?', [orderId]);
  for (const d of rows) {
    // P1-9: khoa dong cong no truoc khi ghi (chong ghi de/lost-update).
    const cur = typeof c.lock === 'function'
      ? (await c.lock('SELECT * FROM debts WHERE id=?', [d.id])) || d
      : d;
    await c.run("UPDATE debts SET status='cancelled' WHERE id=?", [d.id]);
    await writeAudit(c, actor || 'system', 'update', 'debts', d.id, { status: cur.status }, { status: 'cancelled' });
  }
}

function due7() {
  // Phase 0.5: cong 7 ngay theo gio VN (khong qua Date/UTC de tranh lech ngay).
  return businessDayVN(7);
}

async function recordPayment(conn, { debt_id = null, expense_id = null, order_id = null, amount, method, actor = null, note = null, idempotency_key = null }) {
  return withTx(async (c) => {
  if ((debt_id && expense_id) || (!debt_id && !expense_id)) throw new AppError('VALIDATION', 'Payment phai gan dung 1 trong debt_id/expense_id', 400);
  if (!amount || amount === 0) throw new AppError('VALIDATION', 'amount khac 0', 400);
  if (!['cash', 'bank', 'ewallet'].includes(method)) throw new AppError('VALIDATION', 'method khong hop le', 400);
    if (idempotency_key) {
      const ex = await c.get('SELECT * FROM payments WHERE idempotency_key=?', [idempotency_key]);
      if (ex) return { id: ex.id, deduped: true };
    }
    if (debt_id) {
      // TX-03: khoa dong cong no (FOR UPDATE tren PG). Hai payment song song
      // cung 1 debt se phai cho nhau -> khong con "doc paid=0 roi ghi 140".
      const d = await lockDebt(c, debt_id);
      if (!d) throw new AppError('NOT_FOUND', 'Khong tim thay cong no', 404);
      const newPaid = Number(d.paid) + Number(amount);
      if (newPaid < 0 || newPaid > Number(d.amount)) throw new AppError('VALIDATION', `Vuot remain (remain=${Number(d.amount) - Number(d.paid)})`, 400);
      let r;
      try {
        r = await c.run(
          'INSERT INTO payments(debt_id,order_id,amount,method,actor,note,idempotency_key) VALUES(?,?,?,?,?,?,?)',
          [debt_id, order_id || d.order_id, amount, method, actor, note, idempotency_key]
        );
      } catch (e) {
        // TX-04: retry cung idempotency_key -> unique violation -> tra ban ghi cu.
        if (idempotency_key && require('../../common/db').isUniqueViolation(e)) {
          const dup = await c.get('SELECT * FROM payments WHERE idempotency_key=?', [idempotency_key]);
          if (dup) return { id: dup.id, deduped: true };
        }
        throw e;
      }
    const pid = insertedId(r, 'payments');
    // Phase 3: payment thuoc phong ban finance.
    await setBusinessScope(c, 'payments', pid, 'finance');
    const status = newPaid >= Number(d.amount) ? 'done' : d.status;
    // TX-03: UPDATE co dieu kien (WHERE paid=? cu) -> neu row dang bi doi
    // boi giao dich khac thi changes=0 va ta rollback thay vi ghi de.
    const up = await c.run('UPDATE debts SET paid=?, status=? WHERE id=? AND paid=?', [newPaid, status, debt_id, Number(d.paid)]);
    if (Number(up?.changes || 0) === 0) throw new AppError('CONFLICT', 'Cong no vua bi cap nhat boi giao dich khac — thu lai', 409);
    await writeAudit(c, actor || 'system', 'create', 'payments', pid, null, { debt_id, amount, method });
    await writeAudit(c, actor || 'system', 'update', 'debts', debt_id, { paid: d.paid }, { paid: newPaid });
    // day trang thai don qua module sales (giu bien ownership)
    if (order_id || d.order_id) {
      try {
        const salesService = require('../sales/service');
        await salesService.setOrderPaid(c, order_id || d.order_id, actor);
      } catch {}
    }
    return { id: pid };
  }
  // expense leg
  const e = await lockExpense(c, expense_id);
  if (!e) throw new AppError('NOT_FOUND', 'Khong tim thay chi phi', 404);
  if (amount < 0) throw new AppError('VALIDATION', 'Chi phi khong hoan tien am', 400);
  constGateExpense(await c.get('SELECT * FROM approvals WHERE ref_type=\'expense\' AND ref_id=? AND status=\'approved\' ORDER BY id DESC LIMIT 1', [expense_id]), e);
  const newPaid = Number(e.paid) + Number(amount);
  if (newPaid > Number(e.amount)) throw new AppError('VALIDATION', 'Vuot tong chi phi', 400);
  let r;
  try {
    r = await c.run(
      'INSERT INTO payments(expense_id,amount,method,actor,note,idempotency_key) VALUES(?,?,?,?,?,?)',
      [expense_id, amount, method, actor, note, idempotency_key]
    );
  } catch (e) {
    // TX-04: retry cung idempotency_key -> unique violation -> tra ban ghi cu.
    if (idempotency_key && require('../../common/db').isUniqueViolation(e)) {
      const dup = await c.get('SELECT * FROM payments WHERE idempotency_key=?', [idempotency_key]);
      if (dup) return { id: dup.id, deduped: true };
    }
    throw e;
  }
  const pid = insertedId(r, 'payments');
  await setBusinessScope(c, 'payments', pid, 'finance');
  const up = await c.run("UPDATE expenses SET paid=?, status=? WHERE id=? AND paid=?", [newPaid, newPaid >= Number(e.amount) ? 'done' : 'open', expense_id, Number(e.paid)]);
  if (Number(up?.changes || 0) === 0) throw new AppError('CONFLICT', 'Chi phi vua bi cap nhat boi giao dich khac — thu lai', 409);
  await writeAudit(c, actor || 'system', 'create', 'payments', pid, null, { expense_id, amount, method });
  return { id: pid };
  }, conn);
}

// TX-03: khoa dong cong no / chi phi de chong lost-update.
async function lockDebt(c, debtId) {
  if (typeof c.lock === 'function') {
    const row = await c.lock('SELECT * FROM debts WHERE id=?', [debtId]);
    if (row) return row;
  }
  return c.get('SELECT * FROM debts WHERE id=?', [debtId]);
}
async function lockExpense(c, expenseId) {
  if (typeof c.lock === 'function') {
    const row = await c.lock('SELECT * FROM expenses WHERE id=?', [expenseId]);
    if (row) return row;
  }
  return c.get('SELECT * FROM expenses WHERE id=?', [expenseId]);
}

function constGateExpense(appr, e) {
  if (!appr) throw new AppError('APPROVAL_REQUIRED', 'Chi phi chua duyet (can approval approved)', 403);
}

function scoreTx(txRow, debt, orderCode, custCode) {
  let s = 0;
  const content = norm(txRow.content || '');
  if (orderCode && content.includes(norm(orderCode))) s += 60;
  if (custCode && content.includes(norm(custCode))) s += 40;
  const remain = Number(debt.amount) - Number(debt.paid);
  const diff = Math.abs(Number(txRow.amount) - remain);
  if (diff < 1000) s += 40;
  else if (diff < Math.abs(remain) * 0.01) s += 20;
  const dd = Math.abs(new Date(txRow.trans_date) - new Date(debt.created_at || txRow.trans_date)) / 86400000;
  const d2 = isNaN(dd) ? 99 : dd;
  if (d2 <= 3) s += 10;
  else if (d2 <= 7) s += 5;
  return s;
}

async function runReconciliation(conn) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  const txs = await c.query("SELECT * FROM transactions WHERE status='unmatched' ORDER BY id");
  const debts = await c.query("SELECT d.*, o.code AS order_code, cu.code AS cust_code FROM debts d LEFT JOIN orders o ON o.id=d.order_id LEFT JOIN customers cu ON cu.id=d.customer_id WHERE d.type='receivable' AND d.status IN ('open','overdue')");
  let matched = 0;
  const details = [];
  for (const t of txs) {
    let best = null, bestScore = 0, tie = false;
    for (const d of debts) {
      if (Number(d.paid) >= Number(d.amount)) continue;
      const s = scoreTx(t, d, d.order_code, d.cust_code);
      if (s > bestScore) { bestScore = s; best = d; tie = false; }
      else if (s === bestScore && s > 0) tie = true;
    }
    if (best && bestScore >= 80 && !tie) {
      await recordPayment(c, { debt_id: best.id, order_id: best.order_id, amount: Number(t.amount), method: 'bank', actor: 'reconcile', note: `Auto-match ${t.bank_ref}`, idempotency_key: `recon-${t.bank_ref}` });
      await c.run("UPDATE transactions SET status='matched', matched_order_id=? WHERE id=?", [best.order_id, t.id]);
      await writeAudit(c, 'reconcile', 'update', 'transactions', t.id, { status: 'unmatched' }, { status: 'matched' });
      matched++;
      details.push({ bank_ref: t.bank_ref, debt_id: best.id, score: bestScore });
    }
  }
  return { matched, total: txs.length, details };
}

function classifyDebts(rows) {
  const today = todayVN();
  return rows.map((d) => {
    const remain = Number(d.amount) - Number(d.paid);
    let bucket = 'current';
    if (d.due_date && d.due_date < today && d.status !== 'done') bucket = d.due_date < today ? 'overdue' : bucket;
    return { ...d, remain, bucket };
  });
}

function buildReminderMessage(debt, customerName) {
  const remain = Number(debt.amount) - Number(debt.paid);
  return `[Nhac no] Kinh gui ${customerName || 'Quy khach'}, don ${debt.order_id || ''} con lai ${remain.toLocaleString('vi-VN')}d, han ${debt.due_date || 'sap toi'}. Vui long thanh toan. LH CSKH.`;
}

async function remindDebt(conn, debtId, actor) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  const d = await c.get('SELECT * FROM debts WHERE id=?', [debtId]);
  if (!d) throw new AppError('NOT_FOUND', 'Khong tim thay cong no', 404);
  const today = todayVN();
  const ex = await c.get('SELECT * FROM reminder_log WHERE debt_id=? AND sent_date=?', [debtId, today]);
  if (ex) throw new AppError('VALIDATION', 'Hom nay da nhac khoan nay (1 tin/ngay)', 400);
  const cust = d.customer_id ? await c.get('SELECT * FROM customers WHERE id=?', [d.customer_id]) : null;
  const msg = buildReminderMessage(d, cust?.name);
  await c.run('INSERT INTO reminder_log(debt_id,sent_date,channel,message) VALUES(?,?,?,?)', [debtId, today, 'inapp', msg]);
  await writeAudit(c, actor || 'system', 'create', 'reminder_log', debtId, null, { debt_id: debtId, sent_date: today });
  return { debt_id: debtId, sent_date: today, message: msg };
}

async function remindAll(conn, actor) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  const rows = await c.query("SELECT * FROM debts WHERE type='receivable' AND status IN ('open','overdue') AND paid < amount");
  let sent = 0, skipped = 0;
  for (const d of rows) {
    try { await remindDebt(c, d.id, actor); sent++; }
    catch { skipped++; }
  }
  return { sent, skipped, total: rows.length };
}

async function markOverdue(conn) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  const today = todayVN();
  const r = await c.run("UPDATE debts SET status='overdue' WHERE type='receivable' AND status='open' AND due_date IS NOT NULL AND due_date < ? AND paid < amount", [today]);
  return { changes: r.changes || 0 };
}

async function financeKpis(conn) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  const ar = await c.get("SELECT COALESCE(SUM(amount-paid),0) s FROM debts WHERE type='receivable' AND status IN ('open','overdue')");
  const rev = await c.get("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE order_date >= ? AND status NOT IN ('cancelled','refunded','draft')", [sinceVN(30)]);
  const rev30 = Number(rev?.s || 0);
  const dso = rev30 > 0 ? Number(ar?.s || 0) / (rev30 / 30) : 0;
  const cash = await c.get('SELECT COALESCE(SUM(CASE WHEN debt_id IS NOT NULL THEN amount ELSE 0 END),0) thu, COALESCE(SUM(CASE WHEN expense_id IS NOT NULL THEN amount ELSE 0 END),0) chi FROM payments');
  return { ar: Number(ar?.s || 0), revenue30d: rev30, dso: Math.round(dso * 10) / 10, thu: Number(cash?.thu || 0), chi: Number(cash?.chi || 0) };
}

async function cashflow(conn) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  // Phase 0.2: `date(paid_at)` la SQLite-only -> luon that bi PostgreSQL.
  // Dung substr(CAST(x AS TEXT),1,10) — chay duoc tren ca 2 dialect.
  const rows = await c.query("SELECT substr(CAST(paid_at AS TEXT),1,10) d, SUM(CASE WHEN debt_id IS NOT NULL THEN amount ELSE 0 END) thu, SUM(CASE WHEN expense_id IS NOT NULL THEN amount ELSE 0 END) chi FROM payments GROUP BY substr(CAST(paid_at AS TEXT),1,10) ORDER BY d DESC LIMIT 30");
  return rows;
}

module.exports = { createReceivable, createPayable, markDebtCancelled, recordPayment, runReconciliation, classifyDebts, buildReminderMessage, remindDebt, remindAll, markOverdue, financeKpis, cashflow };
