const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

const { getDb } = require('./db');
const { runReconciliation } = require('./modules/reconciliation');
const { classifyDebts, buildReminderMessage } = require('./modules/debt');
const { chatReply } = require('./modules/cskh');
const { overview } = require('./agent/agent');

const app = express();
const db = getDb();
app.use(cors()); app.use(express.json());
app.use(express.static('public'));
const upload = multer({ storage: multer.memoryStorage() });

// ---- helpers
const ok = (res, data) => res.json({ ok: true, data });
const put = (t, cols, body) => { const k = Object.keys(body).filter(x => cols.includes(x)); return { k, v: k.map(x => body[x]) }; };

// ---- core CRUD
app.get('/api/health', (req, res) => ok(res, { status: 'up', time: new Date() }));
app.get('/api/customers', (req, res) => ok(res, db.prepare('SELECT * FROM customers ORDER BY id DESC').all()));
app.post('/api/customers', (req, res) => {
  const { k, v } = put(0, ['code', 'name', 'phone', 'email', 'address', 'note'], req.body);
  const r = db.prepare(`INSERT INTO customers (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...v);
  ok(res, db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid));
});
app.get('/api/orders', (req, res) => ok(res, db.prepare('SELECT o.*, c.name customer_name FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY id DESC').all()));
app.post('/api/orders', (req, res) => {
  const { k, v } = put(0, ['code', 'customer_id', 'amount', 'status', 'order_date', 'note'], req.body);
  const r = db.prepare(`INSERT INTO orders (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...v);
  // tự sinh công nợ phải thu
  if (req.body.customer_id && req.body.amount) db.prepare('INSERT INTO debts (customer_id,order_id,type,amount,due_date) VALUES (?,?,?, ?,date("now","+7 days"))').run(req.body.customer_id, r.lastInsertRowid, 'receivable', req.body.amount);
  ok(res, { id: r.lastInsertRowid });
});
app.get('/api/transactions', (req, res) => ok(res, db.prepare('SELECT * FROM transactions ORDER BY id DESC LIMIT 200').all()));
app.post('/api/transactions', (req, res) => {
  const { k, v } = put(0, ['trans_date', 'amount', 'content', 'bank_ref'], req.body);
  const r = db.prepare(`INSERT INTO transactions (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...v);
  ok(res, { id: r.lastInsertRowid });
});
app.post('/api/transactions/import-csv', upload.single('file'), (req, res) => {
  // CSV: trans_date,amount,content,bank_ref
  const rows = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true });
  const ins = db.prepare('INSERT OR IGNORE INTO transactions (trans_date,amount,content,bank_ref) VALUES (?,?,?,?)');
  let n = 0; for (const r of rows) { try { ins.run(r.trans_date, r.amount, r.content, r.bank_ref); n++; } catch {} }
  const result = runReconciliation(db);
  ok(res, { imported: n, ...result });
});

// ---- đối soát
app.post('/api/reconcile/run', (req, res) => ok(res, runReconciliation(db)));

// ---- công nợ
app.get('/api/debts', (req, res) => ok(res, classifyDebts(db)));
app.post('/api/debts', (req, res) => {
  const { k, v } = put(0, ['customer_id', 'order_id', 'type', 'amount', 'paid', 'due_date', 'note'], req.body);
  const r = db.prepare(`INSERT INTO debts (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...v);
  ok(res, { id: r.lastInsertRowid });
});
function remindDebt(id) {
  const d = classifyDebts(db).find(x => x.id == id);
  if (!d) return null;
  const msg = buildReminderMessage(d);
  db.prepare('INSERT INTO reminders (debt_id,channel,message) VALUES (?,?,?)').run(id, 'inapp', msg);
  return { debt: d, message: msg };
}
app.post('/api/debts/:id/remind', (req, res) => ok(res, remindDebt(req.params.id)));
app.get('/api/reminders', (req, res) => ok(res, db.prepare('SELECT * FROM reminders ORDER BY id DESC LIMIT 100').all()));

// ---- CSKH
app.post('/api/cskh/chat', async (req, res) => ok(res, { reply: await chatReply(db, req.body.customer_id, req.body.text) }));
app.get('/api/cskh/tickets', (req, res) => ok(res, db.prepare('SELECT * FROM tickets ORDER BY id DESC').all()));
app.post('/api/cskh/tickets', (req, res) => {
  const { k, v } = put(0, ['customer_id', 'subject', 'content', 'priority'], req.body);
  const r = db.prepare(`INSERT INTO tickets (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`).run(...v);
  ok(res, { id: r.lastInsertRowid });
});
app.post('/api/cskh/tickets/:id/close', (req, res) => { db.prepare('UPDATE tickets SET status="closed" WHERE id=?').run(req.params.id); ok(res, { closed: true }); });

// ---- đa phòng ban
app.get('/api/departments/overview', (req, res) => ok(res, overview(db)));

// ---- cron nhắc nợ 8h sáng
cron.schedule(process.env.REMINDER_CRON || '0 8 * * *', () => {
  const debts = classifyDebts(db).filter(d => d.bucket === 'overdue' || d.bucket === 'due_soon');
  debts.forEach(d => remindDebt(d.id));
  console.log(`[cron] reminded ${debts.length} debts`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BizOps AI chạy tại http://localhost:${PORT}`));
