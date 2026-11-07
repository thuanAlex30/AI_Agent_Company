// setup.js — chạy TRƯỚC mỗi test file.
//
// V8.1 / Phase 0.1 — chống "test xanh giả":
//   - DATABASE_PATH phai la DUONG DAN TUYET DOI (khong phu thuoc CWD).
//   - DB test phai TACH BIET khỏi DB dev (data/bizops.db).
//   - Tu chay migrate + seed demo idempotent neu DB test chua co bang
//     -> "npm test" luon xanh tu sach, khong con fail lung tung khi
//        bien moi truong DATABASE_PATH con sot lai tu shell ngoai.
//
// GUARD: neu DATABASE_PATH tro vao DB dev/du lieu that -> throw, de khong
// bao gio ghi rac vao du lieu nghiep vu that.
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-32-ky-tu-cho-ci-du-dai';
process.env.AGENT_INTERNAL_KEY = process.env.AGENT_INTERNAL_KEY || 'test-agent-internal-32-ky-tu-cho-ci';
process.env.AGENT_PUBLIC_KEY = process.env.AGENT_PUBLIC_KEY || 'test-agent-public-32-ky-tu-cho-ci-x';
process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test-webhook-secret-32-ky-tu-cho-ci';

// Thu muc goc cua backend (backend/), va thu muc data/ o goc repo.
const BACKEND_DIR = path.resolve(__dirname, '..');
const REPO_DATA_DIR = path.resolve(BACKEND_DIR, '..', 'data');

function resolveDbPath() {
  const raw = process.env.DATABASE_PATH;
  if (!raw) return path.join(REPO_DATA_DIR, 'bizops-test.db');
  // Neu env trong la duong dan tuong doi -> resolve theo BACKEND_DIR.
  return path.isAbsolute(raw) ? raw : path.resolve(BACKEND_DIR, raw);
}

const dbPath = resolveDbPath();
const devPath = path.join(REPO_DATA_DIR, 'bizops.db');

if (path.resolve(dbPath) === path.resolve(devPath)) {
  throw new Error(
    '[setup] DATABASE_PATH khong duoc tro vao DB dev (data/bizops.db). ' +
    'Test phai chay tren DB rieng (data/bizops-test.db) de khong ghi rac du lieu that.'
  );
}

process.env.DATABASE_PATH = dbPath;

// --- Tu migrate + seed (idempotent) ---------------------------------------
// Chi chay 1 lan cho ca process (moi file test require setup.js rieng,
// nhung Node cache module -> chi chay 1 lan).
//
// RACE-FIX (CI run 42388510812: `MIGRATE FAIL: database is locked`):
//   Node test runner chay MOI FILE TEST trong process rieng, tat ca cung
//   tro vao MOT file SQLite (data/bizops-test.db). Lock cu chi bao quanh
//   seed-storefront, BO LOT migrate() + demo seed, va stale-lock cu tu y
//   xoa lock cua process khac => nhieu process cung migrate/seed.
//   => TOAN BO bootstrap (migrate + demo seed + storefront seed) chay trong
//      bootstrap-lock (tests/bootstrap-lock.js): acquire bang create-exclusive,
//      chi xoa stale khi lock CU + PID chu DA CHET, het timeout ma lock van
//      bi process SONG giu => THROW (fail that, khong nuot loi).
//   Duong PG (PG_HOST) khong dung file lock — chay truc tiep nhu cu.
let ready = null;
function ensureDb() {
  if (!ready) {
    ready = (async () => {
      const boot = async () => {
        const { migrate } = require('../src/db/migrate');
        await migrate();
        const { get } = require('../src/common/db');
        // PHASE 0.1 (fix race): nhieu file test chay SONG SONG tren cung DB test.
        // Neu chi kiem tra `users` co rong hay khong, 1 file test co the chen
        // user truoc khi seed chay => seed bi skip => thieu user 'admin' =>
        // test fail lung tung. => kiem tra DUNG user seed ('admin') moi seed.
        const admin = await get("SELECT id FROM users WHERE username='admin'");
        if (!admin) {
          const { execSync } = require('child_process');
          execSync(`node "${path.join(BACKEND_DIR, 'src', 'db', 'migrate.js')}" --seed`, {
            cwd: BACKEND_DIR,
            stdio: 'inherit',
            env: { ...process.env, DATABASE_PATH: dbPath, ALLOW_AUTO_SEED: '1' },
          });
        }
        // Seed storefront (COMBO-SANG, DV-*, banners, promotions) — idempotent.
        // Loi seed that phai THROW (fail test) — khong console.error roi di tiep.
        await seedStorefront();
        return true;
      };
      if (process.env.PG_HOST) return boot();
      const { withBootstrapLock } = require('./bootstrap-lock');
      return withBootstrapLock(dbPath, boot);
    })();
  }
  return ready;
}

/**
 * Chay seed-storefront.cjs (dialect-agnostic) — idempotent.
 *
 * Da chay trong bootstrap-lock cua ensureDb() nen khong can lock rieng.
 * Loi seed that => reject (test fail that), khong nuot exception.
 */
async function seedStorefront() {
  const { execFile } = require('child_process');
  await new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [path.join(BACKEND_DIR, 'seed-storefront.cjs')],
      { cwd: BACKEND_DIR, env: { ...process.env, DATABASE_PATH: dbPath } },
      (err) => {
        if (err) return reject(new Error('[setup] seed-storefront FAIL: ' + err.message));
        resolve();
      }
    );
  });
}

// Node test runner: hook 'before' chay 1 lan truoc tat ca test trong file.
// LUU Y: `before` KHONG phai global o CommonJS — phai lay tu 'node:test'.
const nodeTest = require('node:test');
if (typeof nodeTest.before === 'function') {
  nodeTest.before(async () => { await ensureDb(); });
} else {
  // Fallback (khong phai node:test): chay ngay, khong await duoc o CJS.
  ensureDb().catch((e) => { console.error('[setup] ensureDb fail:', e.message); process.exitCode = 1; });
}

module.exports = { ensureDb, dbPath, BACKEND_DIR };
