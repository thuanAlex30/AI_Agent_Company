// public/webhook.js — P3 webhook VietQR (PAY-01 FIX v7: ky byte tho + timestamp bat buoc + limiter rieng)
// Luong: raw bytes -> verify HMAC("{timestamp}.{rawBody}") -> parse SAU verify -> tx -> 2xx sau commit.
// Ghi ca webhook bi tu choi (signature_ok=0) de doi soat.
const express = require('express');
const crypto = require('crypto');
const { ok, fail, AppError } = require('../common/errors');
const { get, tx, nowISO, todayVN } = require('../common/db');
const { webhookLimiter } = require('./limiters');
const logger = require('../common/logger');

const router = express.Router();
// SEC-03/PAY-01 FIX v7: limiter GAN THEO ROUTE — router.use o day se dem ca route khac
// KHONG dung express.json o day — server.js da mount express.raw() cho duong nay TRUOC json toan cuc.
// req.body la Buffer (byte tho tu NHA CUNG CAP).

function hmacOk(secret, ts, rawBuf, sigHex) {
  const calc = crypto.createHmac('sha256', secret).update(`${ts}.`).update(rawBuf).digest();
  let given;
  try { given = Buffer.from(String(sigHex || '').trim(), 'hex'); } catch { return false; }
  if (!given || given.length !== calc.length) return false;
  try { return crypto.timingSafeEqual(given, calc); } catch { return false; }
}

async function logRejected({ provider, bankRef, payloadHash, note }) {
  try {
    await get('SELECT 1');
    const { run } = require('../common/db');
    await run(
      'INSERT INTO pay_webhook_logs(provider,bank_ref,payload_hash,signature_ok,processed_at,note) VALUES(?,?,?,?,?,?) ON CONFLICT(bank_ref) DO NOTHING',
      [String(provider || 'vietqr').slice(0, 20), String(bankRef || `rej-${Date.now()}-${Math.floor(Math.random() * 1e6)}`), String(payloadHash || ''), false, null, String(note || '').slice(0, 300)]
    );
  } catch {}
}

router.post('/payments/webhook', webhookLimiter, async (req, res) => {
  const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}), 'utf8');
  try {
    const secret = process.env.WEBHOOK_SECRET || '';
    if (!secret) throw new AppError('VALIDATION', 'Webhook chua cau hinh (thieu WEBHOOK_SECRET)', 500);
    // 1. timestamp BAT BUOC, cua so ±5 phut (chong replay). Qua han -> 401 (khong 200 deduped).
    const tsRaw = String(req.headers['x-timestamp'] || '').trim();
    if (!tsRaw) {
      await logRejected({ bankRef: null, payloadHash: crypto.createHash('sha256').update(rawBuf).digest('hex'), note: 'missing-timestamp' });
      throw new AppError('AUTH', 'Thieu x-timestamp', 401);
    }
    const tsNum = Number(tsRaw);
    if (!Number.isFinite(tsNum)) {
      await logRejected({ bankRef: null, payloadHash: crypto.createHash('sha256').update(rawBuf).digest('hex'), note: 'bad-timestamp' });
      throw new AppError('AUTH', 'x-timestamp khong hop le', 401);
    }
    const tsMs = String(tsRaw).length <= 10 ? tsNum * 1000 : tsNum;
    if (Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
      await logRejected({ bankRef: null, payloadHash: crypto.createHash('sha256').update(rawBuf).digest('hex'), note: 'timestamp-skew-replay' });
      throw new AppError('AUTH', 'Webhook het han (replay)', 401);
    }
    // 2. verify HMAC tren BYTE THO (khong phai JSON.stringify sau parse)
    const sig = req.headers['x-signature'] || req.headers['x-webhook-signature'] || '';
    if (!hmacOk(secret, tsRaw, rawBuf, sig)) {
      let bankRefGuess = null;
      try { bankRefGuess = JSON.parse(rawBuf.toString('utf8'))?.bank_ref || null; } catch {}
      await logRejected({ bankRef: bankRefGuess, payloadHash: crypto.createHash('sha256').update(rawBuf).digest('hex'), note: 'bad-signature' });
      throw new AppError('AUTH', 'Chu ky webhook khong hop le', 401);
    }
    // 3. Chi parse SAU khi xac thuc
    let payload;
    try { payload = JSON.parse(rawBuf.toString('utf8')); }
    catch { throw new AppError('VALIDATION', 'Webhook body khong phai JSON', 400); }
    const { bank_ref, order_code, amount, provider } = payload || {};
    if (!bank_ref || !order_code || amount == null) throw new AppError('VALIDATION', 'Webhook can bank_ref + order_code + amount', 400);
    const payloadHash = crypto.createHash('sha256').update(rawBuf).digest('hex');
    const out = await tx(async (c) => {
      const existed = await c.get('SELECT * FROM pay_webhook_logs WHERE bank_ref=?', [String(bank_ref)]);
      if (existed && existed.processed_at) return { deduped: true };
      const order = await c.get('SELECT * FROM orders WHERE code=? OR lookup_code=?', [String(order_code), String(order_code)]);
      if (!order) throw new AppError('NOT_FOUND', 'Khong tim thay don cho webhook', 404);
      const debt = await c.get("SELECT * FROM debts WHERE order_id=? AND type='receivable' ORDER BY id LIMIT 1", [order.id]);
      if (!debt) throw new AppError('NOT_FOUND', 'Don chua co cong no', 404);
      const remain = Number(debt.amount) - Number(debt.paid);
      // PAY-01: canh bao khi amount != so con lai (van xu ly neu <= remain; recordPayment chan vuot)
      if (Number(amount) !== remain) {
        logger.warn('webhook amount-mismatch', { bank_ref: String(bank_ref), order: order.code, amount: Number(amount), remain });
      }
      await c.run(
        'INSERT INTO pay_webhook_logs(provider,bank_ref,payload_hash,signature_ok,processed_at,note) VALUES(?,?,?,?,?,?) ON CONFLICT(bank_ref) DO NOTHING',
        [String(provider || 'vietqr').slice(0, 20), String(bank_ref), payloadHash, true, null, `order=${order.code} amount=${amount}`]
      );
      const financeService = require('../modules/finance/service');
      const method = ['cash', 'bank', 'ewallet'].includes(payload.method) ? payload.method : 'bank';
      const pay = await financeService.recordPayment(c, {
        debt_id: debt.id, order_id: order.id, amount: Number(amount),
        method, actor: 'webhook', note: `Webhook ${bank_ref}`, idempotency_key: `webhook-${bank_ref}`,
      });
      try {
        await c.run(
          "INSERT INTO transactions(trans_date,amount,content,bank_ref,matched_order_id,status) VALUES(?,?,?,?,?,?) ON CONFLICT(bank_ref) DO NOTHING",
          [todayVN(), Number(amount), `Webhook ${String(bank_ref)} ${order.code}`, String(bank_ref), order.id, 'matched']
        );
        await c.run("UPDATE transactions SET status='matched', matched_order_id=? WHERE bank_ref=?", [order.id, String(bank_ref)]);
      } catch {}
      await c.run('UPDATE pay_webhook_logs SET processed_at=?, signature_ok=TRUE WHERE bank_ref=?', [nowISO(), String(bank_ref)]);
      const { writeAudit } = require('../common/audit');
      await writeAudit(c, 'webhook', 'create', 'pay_webhook_logs', order.id, null, { bank_ref, order: order.code, amount });
      return { order_code: order.code, status: 'paid-recorded', payment_id: pay.id, deduped: !!pay.deduped };
    });
    // Chi tra 2xx SAU khi commit (tx resolve = da commit)
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

module.exports = router;
