const express = require('express');
const { authenticate, requirePerm } = require('../common/auth');
const { ok, fail, AppError } = require('../common/errors');
const { get, all, run, tx, norm } = require('../common/db');
const { reqStr, reqIntPos, reqCode } = require('../common/validate');
const { uploadCsv } = require('../common/upload');
const financeService = require('../modules/finance/service');

const router = express.Router();
router.use(authenticate);

// transactions
router.get('/transactions', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM transactions ORDER BY id DESC LIMIT 500')); }
  catch (e) { return fail(res, e); }
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
router.get('/debts', requirePerm('orders.read'), async (req, res) => {
  try {
    const rows = await all('SELECT * FROM debts ORDER BY id DESC LIMIT 500');
    return ok(res, financeService.classifyDebts(rows));
  } catch (e) { return fail(res, e); }
});
router.post('/debts', requirePerm('debts.write'), async (req, res) => {
  try {
    const amount = reqIntPos(req.body, 'amount');
    const type = reqStr(req.body, 'type', { enum: ['receivable', 'payable'] });
    if (type === 'receivable') {
      return ok(res, await financeService.createReceivable(null, {
        customer_id: reqIntPos(req.body, 'customer_id'), order_id: req.body.order_id || null,
        amount, due_date: req.body.due_date || null, created_by: req.user.username, note: req.body.note || null,
      }));
    }
    return ok(res, await financeService.createPayable(null, {
      order_id: req.body.order_id || null, amount,
      due_date: req.body.due_date || null, created_by: req.user.username, note: req.body.note || null,
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
router.post('/payments', requirePerm('payments.write'), async (req, res) => {
  try {
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
router.get('/expenses', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM expenses ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/expenses', requirePerm('expenses.write'), async (req, res) => {
  try {
    const code = reqCode(req.body, 'code');
    const amount = reqIntPos(req.body, 'amount');
    const type = reqStr(req.body, 'type', { enum: ['payable', 'fee', 'salary', 'marketing', 'other'] });
    const r = await run('INSERT INTO expenses(code,type,amount,paid,status,created_by,due_date,note) VALUES(?,?,?,?,?,?,?,?)',
      [code, type, amount, 0, 'open', req.user.username, req.body.due_date || null, req.body.note || null]);
    const id = r.lastInsertRowid || (await get('SELECT id FROM expenses WHERE code=?', [code]))?.id;
    // tu dong tao approval theo nguong v6.1
    const level = amount < 5000000 ? 'leader' : amount < 50000000 ? 'manager' : amount < 200000000 ? 'cfo' : 'ceo';
    await run('INSERT INTO approvals(ref_type,ref_id,requester,level,status) VALUES(?,?,?,?,?)', ['expense', id, req.user.id, level, 'pending']);
    return ok(res, { id, code, approval_level: level });
  } catch (e) { return fail(res, e); }
});

router.get('/finance/kpis', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await financeService.financeKpis(null)); }
  catch (e) { return fail(res, e); }
});
router.get('/reminders', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM reminder_log ORDER BY id DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.get('/budgets', requirePerm('orders.read'), async (req, res) => {
  try { return ok(res, await all('SELECT * FROM budgets ORDER BY month DESC LIMIT 200')); }
  catch (e) { return fail(res, e); }
});
router.post('/budgets', requirePerm('budgets.write'), async (req, res) => {
  try {
    await run('INSERT INTO budgets(dept_code,month,planned,actual) VALUES(?,?,?,?) ON CONFLICT(dept_code,month) DO NOTHING',
      [reqStr(req.body, 'dept_code'), reqStr(req.body, 'month', { max: 7 }), reqIntPos(req.body, 'planned'), 0]);
    return ok(res, { done: true });
  } catch (e) { return fail(res, e); }
});

module.exports = router;
