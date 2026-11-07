'use strict';
// bootstrap-lock.js — khoa cross-process cho khoi tao DB test SQLite.
//
// VAN DE (CI run 42388510812: `MIGRATE FAIL: database is locked`):
//   - Moi file test chay trong process rieng, tat ca require tests/setup.js
//     va cung tro vao MOT file SQLite (data/bizops-test.db).
//   - Lock cu chi bao quanh seed-storefront, BO LOT migrate() + demo seed.
//   - Logic stale-lock cu: het 120s la XOA lock bat ke process khac dang giu
//     => 2 process cung migrate/seed => "database is locked" / UNIQUE failed.
//
// QUY TAC:
//   - Acquire bang file create-exclusive ('wx'): chi 1 owner.
//   - KHONG bao gio xoa lock cua process khac: stale chi duoc xoa khi
//     (a) lock QUA CU (> STALE_MS) VA (b) PID chu da CHET (kill(pid,0)=ESRCH).
//   - Het ACQUIRE_TIMEOUT_MS ma lock van bi process SONG giu => THROW
//     (fail that, khong che exit code, khong nuot loi).
//   - Release chi xoa khi nonce khop (dung owner moi duoc xoa).
const fs = require('fs');

const ACQUIRE_TIMEOUT_MS = 120000;
const STALE_MS = 5 * 60 * 1000;
const POLL_MS = 200;

/** Lock file di kem DB: moi DB test co lock rieng, khong dung chung global. */
function lockFileFor(dbPath) {
  return dbPath + '.bootstrap.lock';
}

/** PID con song khong? EPERM = ton tai (khong quyen signal) => coi nhu song. */
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code !== 'ESRCH';
  }
}

function readLock(lockFile) {
  try {
    return JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  } catch {
    return null;
  }
}

async function acquireLock(lockFile, timeoutMs = ACQUIRE_TIMEOUT_MS) {
  const nonce = process.pid + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const payload = JSON.stringify({ pid: process.pid, ts: Date.now(), nonce });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      fs.writeFileSync(lockFile, payload, { flag: 'wx' });
      return nonce;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const cur = readLock(lockFile);
    const age = cur && cur.ts ? Date.now() - cur.ts : 0;
    if (cur && age > STALE_MS && !isAlive(cur.pid)) {
      // Chi truong hop nay moi duoc xoa: lock cu + chu da chet.
      try { fs.unlinkSync(lockFile); } catch { /* dua nhau tao lai -> cho vong sau */ }
      continue;
    }
    if (Date.now() > deadline) {
      throw new Error(
        '[bootstrap-lock] timeout cho lock ' + lockFile +
        ' (lock dang duoc process khac giu — khong tu y xoa).'
      );
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

/** Chi owner (nonce khop) moi duoc xoa lock. */
function releaseLock(lockFile, nonce) {
  try {
    const cur = readLock(lockFile);
    if (cur && cur.nonce !== nonce) return;
    fs.unlinkSync(lockFile);
  } catch { /* het lock hoac da duoc don — khong phai loi */ }
}

async function withBootstrapLock(dbPath, fn) {
  const lockFile = lockFileFor(dbPath);
  const nonce = await acquireLock(lockFile);
  try {
    return await fn();
  } finally {
    releaseLock(lockFile, nonce);
  }
}

module.exports = { lockFileFor, acquireLock, releaseLock, withBootstrapLock, isAlive };
