const fs = require('fs');
const path = require('path');
// Phase 0.5: ten file log theo ngay VN (khong lech 1 ngay 00:00-07:00).
const { todayVN } = require('./db');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

function ensureDir() {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
}

/**
 * Phase 6 (OPS-04): moi dong log co `request_id` de truy vet 1 request
 * xuyen suott (frontend -> nginx -> backend -> agent).
 * `req.requestId` duoc gan boi `applySecurity` (src/common/security.js).
 * Log goi trong request nen dung `AsyncLocalStorage` de khong phai truyen
 * requestId moi noi.
 */
const { AsyncLocalStorage } = require('async_hooks');
const als = new AsyncLocalStorage();

/** Bat context request (goi trong middleware). */
function withRequest(req, fn) {
  return als.run(req && req.requestId ? req.requestId : null, fn);
}

/** request_id hien tai (null neu ngoai request context). */
function currentRequestId() {
  const v = als.getStore();
  return v || null;
}

function line(level, msg, meta) {
  const ts = new Date().toISOString();
  const rid = (meta && meta.request_id) || currentRequestId();
  // Phase 6: request_id LUON present (null neu ngoai context) => de doc theo
  // 1 request ma khong can tien xu ly log.
  const ridPart = `[rid=${rid || '-'}]`;
  const m = (meta && meta.request_id !== undefined)
    ? Object.assign({}, meta, { request_id: rid || null })
    : Object.assign({ request_id: rid || null }, meta || {});
  return `[${ts}] [${level}] ${ridPart} ${msg}` + (Object.keys(m).length ? ' ' + JSON.stringify(m) : '');
}
function append(lineStr) {
  ensureDir();
  const f = path.join(LOG_DIR, `app-${todayVN()}.log`);
  try { fs.appendFileSync(f, lineStr + '\n'); } catch {}
}
function info(msg, meta) { const l = line('INFO', msg, meta); console.log(l); append(l); }
function warn(msg, meta) { const l = line('WARN', msg, meta); console.warn(l); append(l); }
function error(msg, meta) { const l = line('ERROR', msg, meta); console.error(l); append(l); }

module.exports = { info, warn, error, withRequest, currentRequestId, als };
