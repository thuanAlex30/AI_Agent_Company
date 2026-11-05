const express = require('express');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { applySecurity, apiLimiter } = require('./common/security');
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

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
applySecurity(app);
// Backend API-only (Frontend React chay rieng port 5173, proxy qua CORS + cookie).
app.use('/api/', apiLimiter);

app.get('/api/health', (req, res) => ok(res, { status: 'up', service: 'backend', version: '6.1.0', time: new Date().toISOString() }));
app.get('/favicon.ico', (req, res) => res.status(204).end());
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
