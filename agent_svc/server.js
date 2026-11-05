const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { ok } = require('./src/errors');
const chatRoutes = require('./src/routes/chat');
const agent = require('./src/agent');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(helmet());
app.use(rateLimit({ windowMs: 5 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => ok(res, { status: 'up', service: 'agent_svc', version: '6.1.0', time: new Date().toISOString() }));
app.use('/', chatRoutes);
app.get('/brief', async (req, res) => {
  try {
    if (req.headers['x-agent-key'] !== (process.env.AGENT_INTERNAL_KEY || 'dev-agent-key')) {
      return res.status(401).json({ ok: false, error: { code: 'AUTH', message: 'Agent key khong hop le' } });
    }
    return ok(res, { markdown: await agent.brief(null) });
  } catch (e) { return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: e.message } }); }
});
app.get('/skills', async (req, res) => {
  try {
    if (req.headers['x-agent-key'] !== (process.env.AGENT_INTERNAL_KEY || 'dev-agent-key')) {
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
