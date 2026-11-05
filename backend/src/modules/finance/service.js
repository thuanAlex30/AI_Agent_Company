const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { norm, todayVN } = require('../../common/db');

// NOTE: module nay so huu debts/payments/expenses/transactions/reminder_log/budgets.
// Cap nhat trang thai don goi qua salesService.setOrderPaid (khong UPDATE truc tiep bang cua sales).

function dbConn(conn, fallback) {
  // conn (trong tx) co {query,get,run}; fallback la module db async
  if (conn && typeof conn.get === 'function') return conn;
  return fallback;
}

async function createReceivable(conn, { customer_id, order_id = null, amount, due_date = null, created_by = null, note = null }) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  if (!customer_id || !amount || amount <= 0) throw new AppError('VALIDATION', 'Receivable can customer_id + amount>0', 400);
  const r = await c.run(
    'INSERT INTO debts(customer_id,order_id,type,amount,paid,due_date,status,note,created_by) VALUES(?,?,?,?,?,?,\'open\',?,?)',
    [customer_id, order_id, 'receivable', amount, 0, due_date || due7(), note, created_by]
  );
  const id = r.lastInsertRowid || (await c.get('SELECT id FROM debts WHERE customer_id=? AND order_id ' + (order_id ? '=?' : 'IS NULL') + ' ORDER BY id DESC LIMIT 1', order_id ? [customer_id, order_id] : [customer_id]))?.id;
  await writeAudit(c, created_by || 'system', 'create', 'debts', id, null, { customer_id, order_id, amount });
  return { id };
}

async function createPayable(conn, { order_id = null, amount, due_date = null, created_by = null, note = null }) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  if (!amount || amount <= 0) throw new AppError('VALIDATION', 'Payable can amount>0', 400);
  const r = await c.run(
    'INSERT INTO debts(customer_id,order_id,type,amount,paid,due_date,status,note,created_by) VALUES(NULL,?,\'payable\',?,0,?,\'open\',?,?)',
    [order_id, amount, due_date || due7(), note, created_by]
  );
  const id = r.lastInsertRowid || (await c.get('SELECT id FROM debts WHERE type=\'payable\' ORDER BY id DESC LIMIT 1'))?.id;
  await writeAudit(c, created_by || 'system', 'create', 'debts', id, null, { order_id, amount });
  return { id };
}

async function markDebtCancelled(conn, orderId, actor) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  const rows = await c.query('SELECT * FROM debts WHERE order_id=?', [orderId]);
  for (const d of rows) {
    await c.run("UPDATE debts SET status='cancelled' WHERE id=?", [d.id]);
    await writeAudit(c, actor || 'system', 'update', 'debts', d.id, { status: d.status }, { status: 'cancelled' });
  }
}

function due7() {
  const d = new Date(todayVN());
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

async function recordPayment(conn, { debt_id = null, expense_id = null, order_id = null, amount, method, actor = null, note = null, idempotency_key = null }) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  if ((debt_id && expense_id) || (!debt_id && !expense_id)) throw new AppError('VALIDATION', 'Payment phai gan dung 1 trong debt_id/expense_id', 400);
  if (!amount || amount === 0) throw new AppError('VALIDATION', 'amount khac 0', 400);
  if (!['cash', 'bank', 'ewallet'].includes(method)) throw new AppError('VALIDATION', 'method khong hop le', 400);
  if (idempotency_key) {
    const ex = await c.get('SELECT * FROM payments WHERE idempotency_key=?', [idempotency_key]);
    if (ex) return { id: ex.id, deduped: true };
  }
  if (debt_id) {
    const d = await c.get('SELECT * FROM debts WHERE id=?', [debt_id]);
    if (!d) throw new AppError('NOT_FOUND', 'Khong tim thay cong no', 404);
    const newPaid = Number(d.paid) + Number(amount);
    if (newPaid < 0 || newPaid > Number(d.amount)) throw new AppError('VALIDATION', `Vuot remain (remain=${Number(d.amount) - Number(d.paid)})`, 400);
    const r = await c.run(
      'INSERT INTO payments(debt_id,order_id,amount,method,actor,note,idempotency_key) VALUES(?,?,?,?,?,?,?)',
      [debt_id, order_id || d.order_id, amount, method, actor, note, idempotency_key]
    );
    const pid = r.lastInsertRowid || (await c.get('SELECT id FROM payments WHERE debt_id=? ORDER BY id DESC LIMIT 1', [debt_id]))?.id;
    const status = newPaid >= Number(d.amount) ? 'done' : d.status;
    await c.run('UPDATE debts SET paid=?, status=? WHERE id=?', [newPaid, status, debt_id]);
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
  const e = await c.get('SELECT * FROM expenses WHERE id=?', [expense_id]);
  if (!e) throw new AppError('NOT_FOUND', 'Khong tim thay chi phi', 404);
  if (amount < 0) throw new AppError('VALIDATION', 'Chi phi khong hoan tien am', 400);
  constGateExpense(await c.get('SELECT * FROM approvals WHERE ref_type=\'expense\' AND ref_id=? AND status=\'approved\' ORDER BY id DESC LIMIT 1', [expense_id]), e);
  const newPaid = Number(e.paid) + Number(amount);
  if (newPaid > Number(e.amount)) throw new AppError('VALIDATION', 'Vuot tong chi phi', 400);
  const r = await c.run(
    'INSERT INTO payments(expense_id,amount,method,actor,note,idempotency_key) VALUES(?,?,?,?,?,?)',
    [expense_id, amount, method, actor, note, idempotency_key]
  );
  const pid = r.lastInsertRowid || (await c.get('SELECT id FROM payments WHERE expense_id=? ORDER BY id DESC LIMIT 1', [expense_id]))?.id;
  await c.run("UPDATE expenses SET paid=?, status=? WHERE id=?", [newPaid, newPaid >= Number(e.amount) ? 'done' : 'open', expense_id]);
  await writeAudit(c, actor || 'system', 'create', 'payments', pid, null, { expense_id, amount, method });
  return { id: pid };
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
  const rev = await c.get("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE order_date >= date('now','-30 days') AND status NOT IN ('cancelled','refunded','draft')");
  const rev30 = Number(rev?.s || 0);
  const dso = rev30 > 0 ? Number(ar?.s || 0) / (rev30 / 30) : 0;
  const cash = await c.get('SELECT COALESCE(SUM(CASE WHEN debt_id IS NOT NULL THEN amount ELSE 0 END),0) thu, COALESCE(SUM(CASE WHEN expense_id IS NOT NULL THEN amount ELSE 0 END),0) chi FROM payments');
  return { ar: Number(ar?.s || 0), revenue30d: rev30, dso: Math.round(dso * 10) / 10, thu: Number(cash?.thu || 0), chi: Number(cash?.chi || 0) };
}

async function cashflow(conn) {
  const db = require('../../common/db');
  const c = dbConn(conn, db);
  const rows = await c.query("SELECT date(paid_at) d, SUM(CASE WHEN debt_id IS NOT NULL THEN amount ELSE 0 END) thu, SUM(CASE WHEN expense_id IS NOT NULL THEN amount ELSE 0 END) chi FROM payments GROUP BY date(paid_at) ORDER BY d DESC LIMIT 30");
  return rows;
}

module.exports = { createReceivable, createPayable, markDebtCancelled, recordPayment, runReconciliation, classifyDebts, buildReminderMessage, remindDebt, remindAll, markOverdue, financeKpis, cashflow };
