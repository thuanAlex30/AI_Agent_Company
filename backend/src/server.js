const express = require('express');
const cookieParser = require('cookie-parser');
require('dotenv').config();
require('./config'); // SEC-02 v7: fail-fast secrets ngay khi boot (prod thieu/yeu -> throw, khong khoi dong)
const { applySecurity, apiLimiter, csrfGuard } = require('./common/security');
const { errorHandler, ok } = require('./common/errors');
const authRoutes = require('./routes/auth');
const salesRoutes = require('./routes/sales');
const supplyRoutes = require('./routes/supply');
const financeRoutes = require('./routes/finance');
const govRoutes = require('./routes/gov-min');
const hrRoutes = require('./routes/hr');
const helpdeskRoutes = require('./routes/helpdesk');
const marketingRoutes = require('./routes/marketing');
const overviewRoutes = require('./routes/overview');
const publicCatalog = require('./public/catalog');
const publicOrders = require('./public/orders');
const publicLookup = require('./public/lookup');
const publicWebhook = require('./public/webhook');
const publicChat = require('./public/chat');

const app = express();
// PAY-01 FIX v7: webhook ky tren BYTE THO — mount express.raw() RIENG cho duong nay TRUOC json toan cuc
app.use('/api/public/payments/webhook', express.raw({ type: '*/*', limit: '100kb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
applySecurity(app);
// Backend API-only (Frontend React chay rieng port 5173, proxy qua CORS + cookie).
// ERP noi bo dung apiLimiter (300/15p/IP). apiLimiter BO QUA /api/public.
// Storefront public co limiter rieng trong `public/limiters.js` (bucket rieng,
// khoa theo IP+signature) — khach dung chung wifi van khong bi 429.
app.use('/api/', apiLimiter);
// Phase 2 (P1-16): CSRF guard cho moi mutation (POST/PUT/PATCH/DELETE).
// Mount SAU public routes? KHONG — csrfGuard tu loai trung /api/public/*,
// /api/auth/login, /api/auth/refresh. Mount TRUOC cac router de bao ve toan bo.
app.use('/api/', csrfGuard);

// --- OPS-03: health endpoints ------------------------------------------------
// Liveness (/api/health): process con song -> luon 200. dung cho container restart.
// Readiness (/api/ready): process + DB (va dependency) san sang -> 503 neu DB loi.
// Healthcheck cu compose phai dung /api/ready de orchestrator khong coi
// service "san sang" khi DB chua san sang.
// Phase 5: version lay tu config.APP_VERSION (1 nguon) — FE doc /api/health.
const { APP_VERSION } = require('./config');
app.get('/api/health', (req, res) => ok(res, { status: 'up', service: 'backend', version: APP_VERSION, time: new Date().toISOString() }));
app.get('/api/ready', async (req, res) => {
  const { get, DIALECT } = require('./common/db');
  const checks = { db: false, dialect: DIALECT };
  try {
    await get('SELECT 1 AS ok');
    checks.db = true;
  } catch (e) {
    checks.db = false;
    checks.dbError = e.message;
  }
  const ready = checks.db;
  return res.status(ready ? 200 : 503).json({
    ok: ready,
    status: ready ? 'ready' : 'not_ready',
    service: 'backend',
    version: APP_VERSION,
    checks,
    time: new Date().toISOString(),
  });
});
app.get('/favicon.ico', (req, res) => res.status(204).end());
// Public storefront truoc (khong auth NV) — phai mount truoc cac router authenticate
app.use('/api/public', publicCatalog);
app.use('/api/public', publicOrders);
app.use('/api/public', publicLookup);
app.use('/api/public', publicWebhook);
app.use('/api/public', publicChat);
app.use('/api/auth', authRoutes);
app.use('/api', salesRoutes);
app.use('/api', supplyRoutes);
app.use('/api', financeRoutes);
app.use('/api', govRoutes);
app.use('/api', hrRoutes);
app.use('/api', helpdeskRoutes);
app.use('/api', marketingRoutes);
app.use('/api', overviewRoutes);

app.use((req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Khong tim thay API' } }));
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  if (process.env.DISABLE_CRON !== '1') {
    try { require('./common/scheduler').initScheduler(); } catch (e) { console.error('scheduler fail', e.message); }
  }
  app.listen(PORT, () => console.log(`Backend chay tai http://localhost:${PORT}`));
}
module.exports = app;
