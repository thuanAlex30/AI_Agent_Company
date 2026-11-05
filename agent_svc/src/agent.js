// agent.js — gop 12 skills + brief (khong cron; scheduler backend goi qua HTTP)
const fs = require('fs');
const path = require('path');
const ov = require('./overview');

async function runAll(conn) {
  const dir = path.join(__dirname, 'skills');
  const out = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const skill = require(path.join(dir, f));
    try { out[skill.key] = await skill.run(conn); }
    catch (e) { out[skill.key] = { status: 'error', message: String(e.message).slice(0, 120) }; }
  }
  return out;
}
async function brief(conn) {
  const data = await ov.getOverview(conn);
  return ov.dailyBrief(data);
}

module.exports = { runAll, brief };
