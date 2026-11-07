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
let ready = null;
function ensureDb() {
  if (!ready) {
    ready = (async () => {
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
      await seedStorefront();
      return true;
    })();
  }
  return ready;
}

/**
 * Chay seed-storefront.cjs (dialect-agnostic) — idempotent.
 *
 * Node test runner chay TUNG FILE TEST trong MOT process rieng => nhieu
 * process goi setup.js song song => nhieu process cung chay migrate/seed
 * => "database is locked". => dung file lock de chi MOT process chay seed,
 * process con lai cho (poll) den khi lock duoc giai phong.
 */
const LOCK_FILE = path.join(REPO_DATA_DIR, '.bizops-test-seed.lock');
const LOCK_TIMEOUT_MS = 120000;

async function seedStorefront() {
  const fs2 = require('fs');
  let acquired = false;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (!acquired) {
    try {
      fs2.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'wx' });
      acquired = true;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Lock da ton tai -> cho mot chút roi thu lai.
      if (Date.now() > deadline) {
        // Lock "ket" (process chet giua chung) => xoa va thu lai.
        try { fs2.unlinkSync(LOCK_FILE); } catch {}
        continue;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  try {
    const { execFile } = require('child_process');
    await new Promise((resolve) => {
      execFile(
        process.execPath,
        [path.join(BACKEND_DIR, 'seed-storefront.cjs')],
        { cwd: BACKEND_DIR, env: { ...process.env, DATABASE_PATH: dbPath } },
        (err) => {
          if (err) console.error('[setup] seed-storefront fail:', err.message);
          resolve();
        }
      );
    });
  } finally {
    try { fs2.unlinkSync(LOCK_FILE); } catch {}
  }
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
