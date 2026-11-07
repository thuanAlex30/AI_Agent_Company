const express = require('express');
const { authenticate, requirePerm, actorId } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run, tx, norm } = require('../common/db');
const { reqStr, reqIntPos, reqCode } = require('../common/validate');
const { uploadCsv } = require('../common/upload');
const {
  requireScoped, scopedList, assertBusinessScope, enforceDept,
  setBusinessScope, resolveResourceDept, scopeFilter,
} = require('../common/scope');
const financeService = require('../modules/finance/service');

const router = express.Router();
router.use(authenticate);

// transactions
router.get('/transactions', requireScoped('finance.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'transactions',
      'SELECT t.* FROM transactions t ORDER BY t.id DESC LIMIT 500');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/transactions', requirePerm('payments.write'), async (req, res) => {
  try {
    const bank_ref = reqCode(req.body, 'bank_ref');
    const amount = reqIntPos(req.body, 'amount');
    const trans_date = reqStr(req.body, 'trans_date', { max: 10 });
    await run('INSERT INTO transactions(trans_date,amount,content,bank_ref,status) VALUES(?,?,?,?,\'unmatched\') ON CONFLICT(bank_ref) DO NOTHING',
      [trans_date, amount, req.body.content || null, bank_ref]);
    return ok(res, { bank_ref });
  } catch (e) { return fail(res, e); }
});
router.post('/transactions/import-csv', requirePerm('payments.write'), uploadCsv.single('file'), async (req, res) => {
  try {
    if (!req.file) throw new AppError('VALIDATION', 'Thieu file CSV (field file)', 400);
    const { parse } = require('csv-parse/sync');
    const records = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
    let imported = 0, skipped = 0;
    for (const r of records.slice(0, 1000)) {
      const bank_ref = String(r.bank_ref || r.ref || '').trim();
      const amount = Number(String(r.amount || '').replace(/[^\d-]/g, ''));
      const trans_date = String(r.trans_date || r.date || '').trim().slice(0, 10);
      if (!bank_ref || !amount || !trans_date) { skipped++; continue; }
      try {
        await run('INSERT INTO transactions(trans_date,amount,content,bank_ref,status) VALUES(?,?,?,?,\'unmatched\') ON CONFLICT(bank_ref) DO NOTHING',
          [trans_date, amount, r.content || r.noi_dung || null, bank_ref]);
        imported++;
      } catch { skipped++; }
    }
    return ok(res, { imported, skipped, total: records.length });
  } catch (e) { return fail(res, e); }
});

// reconcile — doi soat ghi payment that
router.post('/reconcile/run', requirePerm('payments.write'), async (req, res) => {
  try {
    const out = await tx((conn) => financeService.runReconciliation(conn));
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

// debts
router.get('/debts', requireScoped('finance.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'debts',
      'SELECT d.* FROM debts d ORDER BY d.id DESC LIMIT 500');
    return ok(res, financeService.classifyDebts(rows));
  } catch (e) { return fail(res, e); }
});
router.post('/debts', requireScoped('debts.write'), async (req, res) => {
  try {
    const amount = reqIntPos(req.body, 'amount');
    const type = reqStr(req.body, 'type', { enum: ['receivable', 'payable'] });
    // Phase 3 (P0-4): kiem tra scope cua KH/don truoc khi tao cong no
    // (khong ghi cong no cho doi ngoai pham vi).
    if (req.body.customer_id) {
      await assertBusinessScope(null, req.user, 'customers', req.body.customer_id);
    }
    if (req.body.order_id) {
      await assertBusinessScope(null, req.user, 'orders', req.body.order_id);
    }
    if (type === 'receivable') {
      return ok(res, await financeService.createReceivable(null, {
        customer_id: reqIntPos(req.body, 'customer_id'), order_id: req.body.order_id || null,
        amount, due_date: req.body.due_date || null,
        created_by: actorId(req.user), actor: req.user.username, note: req.body.note || null,
      }));
    }
    return ok(res, await financeService.createPayable(null, {
      order_id: req.body.order_id || null, amount,
      due_date: req.body.due_date || null,
      created_by: actorId(req.user), actor: req.user.username, note: req.body.note || null,
    }));
  } catch (e) { return fail(res, e); }
});
router.post('/debts/remind-all', requirePerm('debts.write'), async (req, res) => {
  try { return ok(res, await tx((conn) => financeService.remindAll(conn, req.user.username))); }
  catch (e) { return fail(res, e); }
});
router.post('/debts/:id/remind', requirePerm('debts.write'), async (req, res) => {
  try { return ok(res, await financeService.remindDebt(null, req.params.id, req.user.username)); }
  catch (e) { return fail(res, e); }
});

// payments (ghi that, co Idempotency-Key)
router.post('/payments', requireScoped('payments.write'), async (req, res) => {
  try {
    // Phase 3 (P0-4): kiem tra scope don truoc khi ghi payment.
    if (req.body.order_id) {
      await assertBusinessScope(null, req.user, 'orders', req.body.order_id);
    }
    const out = await tx((conn) => financeService.recordPayment(conn, {
      debt_id: req.body.debt_id || null, expense_id: req.body.expense_id || null,
      order_id: req.body.order_id || null, amount: Number(req.body.amount),
      method: reqStr(req.body, 'method', { enum: ['cash', 'bank', 'ewallet'] }),
      actor: req.user.username, note: req.body.note || null,
      idempotency_key: req.headers['idempotency-key'] || req.body.idempotency_key || null,
    }));
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

// expenses
router.get('/expenses', requireScoped('finance.read'), async (req, res) => {
  try {
    const rows = await scopedList(null, req.user, 'expenses',
      'SELECT e.* FROM expenses e ORDER BY e.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/expenses', requireScoped('expenses.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const amount = reqIntPos(req.body, 'amount');
    const type = reqStr(req.body, 'type', { enum: ['payable', 'fee', 'salary', 'marketing', 'other'] });
    const { writeAudit } = require('../common/audit');
    // Phase 4 (GOV-01): ghi du lieu + audit + approval trong CUNG transaction.
    const out = await tx(async (c) => {
      const r = await c.run('INSERT INTO expenses(code,type,amount,paid,status,created_by,due_date,note) VALUES(?,?,?,?,?,?,?,?)',
        [code, type, amount, 0, 'open', actorId(req.user), req.body.due_date || null, req.body.note || null]);
      const id = r.lastInsertRowid || (await c.get('SELECT id FROM expenses WHERE code=?', [code]))?.id;
      // Phase 3: expenses thuoc phong ban finance.
      await setBusinessScope(c, 'expenses', id, 'finance');
      // INV-6: nguong duyet LAY TU approval-matrix.json (khong hardcode).
      const gov = require('../modules/governance/approvals');
      const level = gov.levelForAmount(amount);
      await c.run('INSERT INTO approvals(ref_type,ref_id,requester,level,status) VALUES(?,?,?,?,?)',
        ['expense', id, req.user.id, level, 'pending']);
      await setBusinessScope(c, 'approvals', id, 'finance');
      await writeAudit(c, req.user.username, 'create', 'expenses', id, null, { code, amount, level });
      return { id, code, approval_level: level };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

router.get('/finance/kpis', requirePerm('finance.read'), async (req, res) => {
  try { return ok(res, await financeService.financeKpis(null)); }
  catch (e) { return fail(res, e); }
});
router.get('/reminders', requireScoped('finance.read'), async (req, res) => {
  try {
    // reminder_log khong co dept_code -> doc qua resource_dept? Log khong gan
    // scope => chi role toan cuc thay duoc (fail-closed cho multi).
    const rows = await scopedList(null, req.user, 'reminder_log',
      'SELECT r.* FROM reminder_log r ORDER BY r.id DESC LIMIT 200');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.get('/budgets', requireScoped('finance.read'), async (req, res) => {
  try {
    // budgets co cot dept_code that -> loc theo scope (fail-closed).
    const rows = scopeFilter(req.user, await all('SELECT * FROM budgets ORDER BY month DESC LIMIT 200'), 'dept_code');
    return ok(res, rows);
  } catch (e) { return fail(res, e); }
});
router.post('/budgets', requireScoped('budgets.write'), async (req, res) => {
  try {
    const dept = reqStr(req.body, 'dept_code');
    // Phase 3: chi tao budget cho phong ban trong scope.
    enforceDept(req.user, dept, 'budget');
    await run('INSERT INTO budgets(dept_code,month,planned,actual) VALUES(?,?,?,?) ON CONFLICT(dept_code,month) DO NOTHING',
      [dept, reqStr(req.body, 'month', { max: 7 }), reqIntPos(req.body, 'planned'), 0]);
    return ok(res, { done: true });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
