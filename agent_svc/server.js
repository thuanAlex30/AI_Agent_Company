const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const cfg = require('./src/config');
const { ok } = require('./src/errors');
const chatRoutes = require('./src/routes/chat');
const agent = require('./src/agent');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(helmet());

// AVAIL-01 FIX v7: limiter TOAN CUC phai dem theo IP THAT cua khach (x-client-ip do backend gui).
// Neu dem theo req.ip, moi khach = 1 IP backend -> ca storefront bi chan (bug goc).
// Request noi bo (khong co x-client-ip) dem theo key dich vu (x-agent-key) de moi backend 1 bucket.
const isTest = process.env.NODE_ENV === 'test';
function clientKey(req) {
  const ip = String(req.headers['x-client-ip'] || '').trim().slice(0, 64);
  if (ip) return ip;
  const svc = String(req.headers['x-agent-key'] || '').trim().slice(0, 64);
  return svc || 'unknown';
}
app.use(rateLimit({
  windowMs: 5 * 60 * 1000, max: isTest ? 1000 : 120, standardHeaders: true, legacyHeaders: false,
  keyGenerator: clientKey,
}));
// Limiter rieng cho route noi bo (brief/skills) — theo key dich vu, khong theo IP khach
const internalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, max: isTest ? 1000 : 60, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => String(req.headers['x-agent-key'] || 'unknown').slice(0, 64),
});

app.get('/health', (req, res) => ok(res, { status: 'up', service: 'agent_svc', version: '8.0.0', time: new Date().toISOString() }));
// OPS-03: readiness — kiem tra DB san sang (khong phai chi process con song).
app.get('/ready', async (req, res) => {
  const { get, DIALECT } = require('./src/db');
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
    service: 'agent_svc',
    version: '8.0.0',
    checks,
    time: new Date().toISOString(),
  });
});
app.use('/', chatRoutes);
app.get('/brief', internalLimiter, async (req, res) => {
  try {
    if (!cfg.checkInternalKey(req.headers['x-agent-key'])) {
      return res.status(401).json({ ok: false, error: { code: 'AUTH', message: 'Agent key khong hop le' } });
    }
    return ok(res, { markdown: await agent.brief(null) });
  } catch (e) { return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } }); }
});
app.get('/skills', internalLimiter, async (req, res) => {
  try {
    if (!cfg.checkInternalKey(req.headers['x-agent-key'])) {
      return res.status(401).json({ ok: false, error: { code: 'AUTH', message: 'Agent key khong hop le' } });
    }
    return ok(res, await agent.runAll(null));
  } catch (e) { return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } }); }
});

app.use((req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Khong tim thay agent API' } }));

const PORT = process.env.AGENT_PORT || 3100;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Agent svc chay tai http://localhost:${PORT}`));
}
module.exports = app;
