// public/webhook.js — P3 webhook VietQR tĩnh (HMAC + replay + idempotency → kế toán)
// Luồng: verify chữ ký → lưu pay_webhook_logs → finance.recordPayment → sales.setOrderPaid
const express = require('express');
const crypto = require('crypto');
const { ok, fail, AppError } = require('../common/errors');
const { get, tx } = require('../common/db');
const { publicOrderLimiter } = require('./limiters');

const router = express.Router();
router.use(publicOrderLimiter);
router.use(express.json({ limit: '100kb' }));

function hmacOk(secret, rawBody, sig) {
  const calc = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(calc);
  const b = Buffer.from(String(sig || ''));
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

router.post('/payments/webhook', async (req, res) => {
  try {
    const secret = process.env.WEBHOOK_SECRET || '';
    if (!secret) throw new AppError('VALIDATION', 'Webhook chua cau hinh (thieu WEBHOOK_SECRET)', 500);
    const sig = req.headers['x-signature'] || req.headers['x-webhook-signature'] || '';
    const ts = Number(req.headers['x-timestamp'] || req.body.timestamp || 0);
    if (ts) {
      const skew = Math.abs(Date.now() - ts * (String(ts).length <= 10 ? 1000 : 1));
      if (skew > 5 * 60 * 1000) {
        // replay / quá hạn — deduped an toàn
        return ok(res, { deduped: true, reason: 'timestamp-skew' });
      }
    }
    const raw = JSON.stringify(req.body || {});
    if (!hmacOk(secret, raw, sig)) throw new AppError('AUTH', 'Chu ky webhook khong hop le', 401);
    const { bank_ref, order_code, amount, provider } = req.body || {};
    if (!bank_ref || !order_code || !amount) throw new AppError('VALIDATION', 'Webhook can bank_ref + order_code + amount', 400);
    const payloadHash = crypto.createHash('sha256').update(raw).digest('hex');
    const out = await tx(async (c) => {
      const existed = await c.get('SELECT * FROM pay_webhook_logs WHERE bank_ref=?', [String(bank_ref)]);
      if (existed && existed.processed_at) return { deduped: true };
      const order = await c.get('SELECT * FROM orders WHERE code=? OR lookup_code=?', [String(order_code), String(order_code)]);
      if (!order) throw new AppError('NOT_FOUND', 'Khong tim thay don cho webhook', 404);
      await c.run(
        'INSERT INTO pay_webhook_logs(provider,bank_ref,payload_hash,signature_ok,processed_at,note) VALUES(?,?,?,?,?,?) ON CONFLICT(bank_ref) DO NOTHING',
        [String(provider || 'vietqr').slice(0, 20), String(bank_ref), payloadHash, 1, new Date().toISOString().slice(0, 19).replace('T', ' '), `order=${order.code} amount=${amount}`]
      );
      const debt = await c.get("SELECT * FROM debts WHERE order_id=? AND type='receivable' ORDER BY id LIMIT 1", [order.id]);
      if (!debt) throw new AppError('NOT_FOUND', 'Don chua co cong no', 404);
      const financeService = require('../modules/finance/service');
      const method = ['cash', 'bank', 'ewallet'].includes(req.body.method) ? req.body.method : 'bank';
      const pay = await financeService.recordPayment(c, {
        debt_id: debt.id, order_id: order.id, amount: Number(amount),
        method, actor: 'webhook', note: `Webhook ${bank_ref}`, idempotency_key: `webhook-${bank_ref}`,
      });
      // I5: moi payment bank phai co 1 transaction matched tuong ung (bank_ref duy nhat)
      const { todayVN } = require('../common/db');
      try {
        await c.run(
          "INSERT INTO transactions(trans_date,amount,content,bank_ref,matched_order_id,status) VALUES(?,?,?,?,?,?) ON CONFLICT(bank_ref) DO NOTHING",
          [todayVN(), Number(amount), `Webhook ${String(bank_ref)} ${order.code}`, String(bank_ref), order.id, 'matched']
        );
        await c.run("UPDATE transactions SET status='matched', matched_order_id=? WHERE bank_ref=?", [order.id, String(bank_ref)]);
      } catch {}
      await c.run('UPDATE pay_webhook_logs SET processed_at=? WHERE bank_ref=?', [new Date().toISOString().slice(0, 19).replace('T', ' '), String(bank_ref)]);
      const { writeAudit } = require('../common/audit');
      await writeAudit(c, 'webhook', 'create', 'pay_webhook_logs', order.id, null, { bank_ref, order: order.code, amount });
      return { order_code: order.code, status: 'paid-recorded', payment_id: pay.id, deduped: !!pay.deduped };
    });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

module.exports = router;
