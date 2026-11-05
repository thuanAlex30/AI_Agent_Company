const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

function ensureDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
}
function line(level, msg, meta) {
  const ts = new Date().toISOString();
  return `[${ts}] [${level}] ${msg}` + (meta ? ' ' + JSON.stringify(meta) : '');
}
function append(lineStr) {
  ensureDir();
  const f = path.join(LOG_DIR, `app-${new Date().toISOString().slice(0, 10)}.log`);
  try { fs.appendFileSync(f, lineStr + '\n'); } catch {}
}
function info(msg, meta) { const l = line('INFO', msg, meta); console.log(l); append(l); }
function warn(msg, meta) { const l = line('WARN', msg, meta); console.warn(l); append(l); }
function error(msg, meta) { const l = line('ERROR', msg, meta); console.error(l); append(l); }

module.exports = { info, warn, error };
