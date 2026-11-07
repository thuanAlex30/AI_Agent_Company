// test-bootstrap.test.js — regression cho race khoi tao DB test SQLite.
//
// BUG (CI run 42388510812): `MIGRATE FAIL: database is locked` — moi file test
// chay trong process rieng, cung require tests/setup.js va cung tro vao MOT
// file SQLite. Lock cu chi bao quanh seed-storefront (bo lot migrate() +
// demo seed), va stale-lock cu tu y xoa lock cua process khac.
const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const BACKEND_DIR = path.resolve(__dirname, '..');
const REPO_DATA_DIR = path.resolve(BACKEND_DIR, '..', 'data');
const DEV_DB = path.join(REPO_DATA_DIR, 'bizops.db');

function runChild(args, env, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: BACKEND_DIR, env });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('child timeout'));
    }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

const BOOT_SCRIPT = "require('./tests/setup.js').ensureDb()"
  + ".then(()=>{console.log('BOOTSTRAP_OK');process.exit(0)})"
  + ".catch((e)=>{console.error('BOOTSTRAP_FAIL: '+((e&&e.message)||e));process.exit(1)})";

// Ep con chay dialect SQLite tren DB tam — khong cham DB cua suite dang chay,
// khong cham PostgreSQL.
function sqliteChildEnv(dbPath) {
  return { ...process.env, NODE_ENV: 'test', PG_HOST: '', DATABASE_PATH: dbPath, ALLOW_AUTO_SEED: '1' };
}

test('boot1: nhieu process bootstrap song song tren DB trang khong dung nhau', async () => {
  const tmpDb = path.join(BACKEND_DIR, 'data', '.tmp-boot-race-' + process.pid + '.db');
  const sidecars = [tmpDb, tmpDb + '-wal', tmpDb + '-shm', tmpDb + '-journal', tmpDb + '.bootstrap.lock'];
  const cleanup = () => { for (const f of sidecars) { try { fs.unlinkSync(f); } catch {} } };
  cleanup();
  try {
    const N = 6;
    const results = await Promise.all(
      Array.from({ length: N }, () => runChild(['-e', BOOT_SCRIPT], sqliteChildEnv(tmpDb)))
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      assert.equal(r.code, 0, `process ${i} phai bootstrap OK (khong duoc fail). output:\n${r.out}`);
      assert.match(r.out, /BOOTSTRAP_OK/, `process ${i} phai in BOOTSTRAP_OK`);
      assert.doesNotMatch(
        r.out, /database is locked|MIGRATE FAIL|BOOTSTRAP_FAIL|UNIQUE constraint failed/,
        `process ${i} khong duoc dinh race migrate/seed`
      );
    }
    // DB duoc seed day du: user admin + san pham COMBO-SANG.
    const Database = require('better-sqlite3');
    const db = new Database(tmpDb, { readonly: true });
    try {
      const admin = db.prepare("SELECT id FROM users WHERE username='admin'").get();
      assert.ok(admin && admin.id, 'phai co user admin sau bootstrap song song');
      const combo = db.prepare("SELECT sku FROM products WHERE sku='COMBO-SANG'").get();
      assert.ok(combo, 'phai co san pham COMBO-SANG sau bootstrap song song');
    } finally {
      db.close();
    }
  } finally {
    cleanup();
  }
});

test('boot2: guard van chan DATABASE_PATH tro vao data/bizops.db', async () => {
  const existed = fs.existsSync(DEV_DB);
  const before = existed ? fs.statSync(DEV_DB).mtimeMs : null;
  const r = await runChild(
    ['-e', "require('./tests/setup.js')"],
    { ...process.env, DATABASE_PATH: DEV_DB }
  );
  assert.notEqual(r.code, 0, 'tro vao DB dev phai fail (exit != 0)');
  assert.match(r.out, /khong duoc tro vao DB dev/, 'phai bao loi guard DB dev');
  if (existed) {
    assert.equal(fs.statSync(DEV_DB).mtimeMs, before, 'DB dev khong duoc bi ghi');
  }
});

test('boot3: lock dang duoc process song giu khong bi cuop; stale cua process chet moi duoc don', async () => {
  const { acquireLock, releaseLock } = require('./bootstrap-lock');
  const lockFile = path.join(os.tmpdir(), '.tmp-boot-lock-' + process.pid + '.lock');
  try { fs.unlinkSync(lockFile); } catch {}
  try {
    const nonce = await acquireLock(lockFile, 5000);
    try {
      // Process thu 2 phai cho/timeout — KHONG duoc cuop hay xoa lock.
      const stealScript = "require('./tests/bootstrap-lock.js')"
        + '.acquireLock(' + JSON.stringify(lockFile) + ', 2000)'
        + ".then(()=>{console.log('LOCK_STOLEN');process.exit(0)})"
        + ".catch((e)=>{console.error('LOCK_WAIT_FAIL: '+((e&&e.message)||e));process.exit(1)})";
      const r = await runChild(['-e', stealScript], { ...process.env }, 30000);
      assert.notEqual(r.code, 0, 'process thu 2 phai timeout, khong duoc cuop lock');
      assert.doesNotMatch(r.out, /LOCK_STOLEN/, 'lock khong duoc bi cuop');
      const cur = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      assert.equal(cur.nonce, nonce, 'lock cua owner dang song khong duoc bi xoa/sua');
    } finally {
      releaseLock(lockFile, nonce);
    }
    assert.ok(!fs.existsSync(lockFile), 'release phai xoa lock');
    // Stale lock cua PID da chet => duoc don va acquire OK.
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 2147483647, ts: Date.now() - 10 * 60 * 1000, nonce: 'stale' }));
    const nonce2 = await acquireLock(lockFile, 10000);
    releaseLock(lockFile, nonce2);
    assert.ok(!fs.existsSync(lockFile), 'stale lock cua process chet phai duoc don');
  } finally {
    try { fs.unlinkSync(lockFile); } catch {}
  }
});

test('boot4: loi bootstrap that van fail (khong bi nuot)', async () => {
  // DATABASE_PATH tro vao 1 THU MUC (khong phai file DB) => migrate mo DB
  // that bai => ensureDb phai reject => exit != 0.
  const dirAsDb = path.join(BACKEND_DIR, 'data');
  const r = await runChild(['-e', BOOT_SCRIPT], sqliteChildEnv(dirAsDb));
  assert.notEqual(r.code, 0, 'bootstrap loi that phai fail');
  assert.match(r.out, /BOOTSTRAP_FAIL/, 'loi phai hien ro, khong bi nuot');
  try { fs.unlinkSync(dirAsDb + '.bootstrap.lock'); } catch {}
});

test('boot5: npm test (run-tests.cjs) phat hien du moi test file, giu exit code', () => {
  const src = fs.readFileSync(path.join(BACKEND_DIR, 'scripts', 'run-tests.cjs'), 'utf8');
  assert.match(src, /readdirSync/, 'run-tests tu liet ke file test');
  assert.match(src, /\.test\.js/, 'run-tests loc *.test.js');
  assert.match(src, /test-concurrency/, 'run-tests giu test-concurrency');
  assert.match(src, /pre-bootstrap/, 'run-tests pre-bootstrap 1 lan truoc suite');
  const runnerCode = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  assert.ok(!/\|\|\s*true/.test(runnerCode), 'run-tests khong che exit code bang || true');
  const onDisk = fs.readdirSync(path.join(BACKEND_DIR, 'tests')).filter((f) => f.endsWith('.test.js'));
  assert.ok(onDisk.length >= 20, 'phai co du test files (' + onDisk.length + ')');
  for (const f of ['test-bootstrap.test.js', 'auth-password.test.js', 'dialect-regression.test.js',
    'race-concurrency.test.js', 'security-regression.test.js']) {
    assert.ok(onDisk.includes(f), 'khong duoc bo test: ' + f);
  }
});
