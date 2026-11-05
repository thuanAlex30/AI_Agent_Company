// scheduler.js — NOI DUY NHAT duoc lap lich (verify enforce).
// 4 cron Asia/Ho_Chi_Minh: 8h markOverdue+remindAll, */5 sop overdue, 2h backup, 8h05 brief.
const cron = require('node-cron');
const { execFile } = require('child_process');
const path = require('path');
const logger = require('./logger');

function initScheduler() {
  cron.schedule('0 8 * * *', async () => {
    try {
      const { tx } = require('./db');
      const financeService = require('../modules/finance/service');
      await tx(async (conn) => {
        const m = await financeService.markOverdue(conn);
        const r = await financeService.remindAll(conn, 'scheduler');
        logger.info('cron 8h07: markOverdue+remindAll', { ...m, ...r });
      });
    } catch (e) { logger.error('cron 8h fail', { msg: e.message }); }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  cron.schedule('*/5 * * * *', async () => {
    try {
      const { run } = require('./db');
      const r = await run("UPDATE sop_tasks SET status='overdue' WHERE status IN ('todo','doing') AND due_date IS NOT NULL AND due_date < date('now')", []);
      if (r.changes) logger.info('cron 5p: sop overdue', { changes: r.changes });
    } catch (e) { logger.error('cron sop fail', { msg: e.message }); }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  cron.schedule('0 2 * * *', async () => {
    execFile('bash', [path.join(__dirname, '..', '..', 'scripts/backup.sh')], (err, stdout, stderr) => {
      if (err) logger.error('cron backup fail', { msg: err.message });
      else logger.info('cron 2h: backup xong');
    });
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  cron.schedule('5 8 * * *', async () => {
    try {
      // brief qua agent_svc (HTTP) — backend khong giu rule/LLM, chi lap lich
      const url = process.env.AGENT_URL || 'http://localhost:3100';
      const key = process.env.AGENT_INTERNAL_KEY || 'dev-agent-key';
      const r = await fetch(url + '/brief', { headers: { 'x-agent-key': key } });
      const body = await r.json().catch(() => ({}));
      if (body.ok) logger.info('cron 8h05: brief tu agent', { len: String(body.data?.markdown || '').length });
      else logger.error('cron brief agent fail', { status: r.status });
    } catch (e) { logger.error('cron brief fail', { msg: e.message }); }
  }, { timezone: 'Asia/Ho_Chi_Minh' });

  logger.info('scheduler: 4 cron VN active');
}

module.exports = { initScheduler };
