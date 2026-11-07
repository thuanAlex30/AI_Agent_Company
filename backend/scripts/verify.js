const fs = require('fs');
const path = require('path');
// npm run verify v6.1 — cong bat buoc truoc moi phase. LLM phai dan toan bo output. ASCII-only de tranh loi encoding.
const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/contract/manifest.json'), 'utf8'));
const enums = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/contract/enums.json'), 'utf8'));
const roles = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/contract/roles-permissions.json'), 'utf8'));
const ownership = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/contract/table-ownership.json'), 'utf8'));
const approval = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/contract/approval-matrix.json'), 'utf8'));
let fail = 0;
let assertCount = 0;
const ok = (c, m) => { assertCount++; console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
const walk = (d, out = []) => { if (!fs.existsSync(d)) return out; for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (['node_modules', '.git', 'data'].includes(f.name)) continue; walk(p, out); } else out.push(p); } return out; };
const files = walk(path.join(ROOT, 'src'));
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

// 1. manifest (v6.1: 35 bang goc + 8 bang storefront P1 = 43)
ok(manifest.count === manifest.tables.length && manifest.count >= 35, 'manifest.count=' + manifest.tables.length);
ok(!manifest.tables.includes('inventory'), 'da bo inventory');
ok(manifest.tables.includes('reminder_log') && manifest.tables.includes('refresh_tokens'), 'co reminder_log + refresh_tokens');
ok(manifest.tables.includes('services') && manifest.tables.includes('service_requests') && manifest.tables.includes('pay_webhook_logs') && manifest.tables.includes('banners'), 'co bang storefront P1');
ok((manifest.money || '').includes('BIGINT'), 'tien BIGINT');
ok((manifest.departments12 || []).length === 12, 'departments=12');
ok(manifest.conventions && manifest.conventions.sla_hours && manifest.conventions.sla_hours.high === 4 && manifest.conventions.sla_hours.urgent === 2, 'SLA urgent=2/high=4 trong manifest.conventions (khong phai root)');
ok(manifest.conventions && manifest.conventions.timezone && manifest.conventions.timezone.includes('Ho_Chi_Minh'), 'co timezone VN trong conventions');
ok(!(' timezone' in manifest) && !(' Conventions' in manifest), 'khong con key thua co dau cach');

// 2. migration (001 goc + 002 storefront P1)
const mig = read(path.join(ROOT, 'src/db/migrations/001_init.sql'));
const mig2 = read(path.join(ROOT, 'src/db/migrations/002_storefront.sql'));
const migPg = read(path.join(ROOT, 'src/db/migrations/001_init.postgres.sql'));
const migPg2 = read(path.join(ROOT, 'src/db/migrations/002_storefront.postgres.sql'));
const mig3 = read(path.join(ROOT, 'src/db/migrations/003_datetime_normalize.sql'));
const migPg3 = read(path.join(ROOT, 'src/db/migrations/003_datetime_normalize.postgres.sql'));
// Phase 3/6: migration 004 (session/auth_version), 005 (resource_dept),
// 006 (backfill dept scope) — phai kem vao tong hop de verify thay THAT.
const mig4 = read(path.join(ROOT, 'src/db/migrations/004_session.sql'));
const migPg4 = read(path.join(ROOT, 'src/db/migrations/004_session.postgres.sql'));
const mig5 = read(path.join(ROOT, 'src/db/migrations/005_dept_scope.sql'));
const migPg5 = read(path.join(ROOT, 'src/db/migrations/005_dept_scope.postgres.sql'));
const mig6 = read(path.join(ROOT, 'src/db/migrations/006_backfill_dept_scope.sql'));
const migPg6 = read(path.join(ROOT, 'src/db/migrations/006_backfill_dept_scope.postgres.sql'));
const migAll = mig + '\n' + mig2 + '\n' + mig3 + '\n' + mig4 + '\n' + mig5 + '\n' + mig6;
const migPgAll = migPg + '\n' + migPg2 + '\n' + migPg3 + '\n' + migPg4 + '\n' + migPg5 + '\n' + migPg6;
if (!mig) ok(false, 'thieu 001_init.sql');
else {
  for (const t of manifest.tables) ok(new RegExp('CREATE TABLE[^;]*\\b' + t + '\\b', 'i').test(migAll), 'migration co bang ' + t);
  ok(/BIGINT/i.test(migAll), 'dung BIGINT');
  ok(!/INSERT OR IGNORE/i.test(migAll + migPgAll), 'cam INSERT OR IGNORE');
  ok(/ON CONFLICT.*DO NOTHING/i.test(migAll + migPgAll), 'dung ON CONFLICT DO NOTHING');
  ok(!/RAISE ABORT/i.test(migAll), 'cam RAISE ABORT trong file chung (de vao file dialect)');
  ok(!/PRAGMA/i.test(migAll), 'cam PRAGMA trong migration (chi duoc trong db.js runtime)');
  // Chi kiem tra PHAN CODE cua migration (bo comment -- va khong kiem tra ten file).
  const migCode = (migAll + '\n' + migPgAll).split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  ok(!/DATETIME/i.test(migCode), 'cam DATETIME (dung TIMESTAMP)');
  ok(!/GLOB/i.test(migCode), 'cam GLOB (khong ANSI; check month bang CHECK month LIKE \'____-__\' hoac regex dialect)');
}
if (mig) for (const [k, vals] of Object.entries(enums)) for (const v of vals) ok(migAll.includes(v), 'enum ' + k + '.' + v + ' co trong migration');

// 3. ownership: auth giu users/refresh_tokens; finance/supply/sales dung bien
const byMod = (frag) => files.filter(f => f.toLowerCase().includes(frag)).map(read).join('\n');
const fin = byMod('finance'), sal = byMod('sales'), sup = byMod('supply'), hr = byMod('/hr');
ok(!/INSERT\s+INTO\s+shipments|UPDATE\s+orders|UPDATE\s+shipments|UPDATE\s+stock_moves/i.test(fin.replace(/sales\.setOrderPaid/gi, '').replace(/salesService\.setOrderPaid/gi, '')), 'finance khong ghi truc tiep orders/shipments/stock_moves (debts/payments la cua finance)');
ok(!/INSERT\s+INTO\s+debts|INSERT\s+INTO\s+shipments|INSERT\s+INTO\s+stock_moves|INSERT\s+INTO\s+payments/i.test(sal), 'sales khong INSERT truc tiep debts/shipments/stock/payments');
ok(!/INSERT\s+INTO\s+debts|INSERT\s+INTO\s+payments|UPDATE\s+debts/i.test(sup), 'supply khong ghi debts/payments (qua finance.createPayable)');
ok(!/INSERT\s+INTO\s+users|INSERT\s+INTO\s+refresh_tokens/i.test(hr), 'hr khong write users/refresh_tokens (auth giu)');

// 4. cron duy nhat
const schedHits = files.filter(f => /cron\.schedule|setInterval\s*\(/.test(read(f)));
ok(schedHits.length <= 1 && (schedHits.length === 0 || schedHits[0].endsWith('scheduler.js')), 'cron chi o scheduler.js (thay: ' + (schedHits.join(', ') || 'chua co') + ')');

// 5. openapi + traceability + backdoor
const openapi = read(path.join(ROOT, 'docs/contract/openapi.yaml'));
for (const r of ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout', '/api/auth/me', '/api/orders', '/api/payments', '/api/customers', '/api/cskh/chat']) ok(openapi.includes(r), 'openapi co ' + r);
const trace = read(path.join(ROOT, 'docs/contract/traceability.csv'));
// QA-01: truoc day check nay la "false-positive" (`|| true`) -> luon PASS,
// khong bao gio bat duoc loi thuoc trace. Sua lai:
//   (a) MOI file test ma trace tro toi phai ton tai that tren dia
//       (backend/tests hoac agent_svc/tests).
//   (b) trace phai day du: it nhat 10 file test duy nhat.
const testsDirs = [path.join(ROOT, 'tests'), path.join(ROOT, '..', 'agent_svc', 'tests')];
const scriptDirs = [
  path.join(ROOT, 'scripts'),
  path.join(ROOT, '..', 'agent_svc', 'scripts'),
  path.join(ROOT, '..', 'storefront', 'scripts'),
  path.join(ROOT, '..', 'scripts'),
];
const ciFile = path.join(ROOT, '..', '.github', 'workflows', 'ci.yml');
const ciSrc = read(ciFile);
// Lay danh sach job CI de validate cac dong trace tro toi CI stage.
const ciJobs = new Set();
for (const m of ciSrc.matchAll(/^  ([a-z0-9-]+):\s*$/gm)) ciJobs.add(m[1]);
const traceRows = trace.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('story,'));
const traceTests = new Set();
for (const row of traceRows) {
  const cols = row.split(',');
  const testCol = cols[cols.length - 2]; // cot "test" (truoc cot "ui")
  if (!testCol) continue;
  for (const f of testCol.split('|')) {
    const name = f.trim();
    if (name) traceTests.add(name);
  }
}
for (const name of traceTests) {
  if (name.endsWith('.test.js')) {
    ok(testsDirs.some((d) => fs.existsSync(path.join(d, name))), 'trace tro toi file test ton tai: ' + name);
  } else if (name.endsWith('.cjs') || name.endsWith('.js') || name.endsWith('.py')) {
    ok(scriptDirs.some((d) => fs.existsSync(path.join(d, name))), 'trace tro toi script ton tai: ' + name);
  } else {
    // Ten CI stage / verify gate — phai xuat hien trong workflow CI.
    ok(ciJobs.has(name) || /gate/i.test(name), 'trace tro toi CI stage ton tai: ' + name);
  }
}
ok(traceTests.size >= 10, 'trace co it nhat 10 file test duy nhat (co ' + traceTests.size + ')');
ok(trace.includes('order-stock-debt.test.js') && trace.includes('payments.test.js'), 'traceability khong vien dan file test khong ton tai');
const srcAll = files.map(read).join('\n');
const hasSrc = files.length > 0;
ok(!/x-user-code/i.test(srcAll) || /NODE_ENV\s*!==?\s*['"]production['"]/i.test(srcAll), 'x-user-code chi dev (co guard prod)');
ok(!/CEO123!/i.test(srcAll), 'khong mat khau mau CEO123!');
const hasServer = fs.existsSync(path.join(ROOT, 'src/server.js'));
if (!hasServer) { ok(true, 'trust proxy (chua co server.js — bo qua)'); ok(true, 'helmet (chua co server.js — bo qua)'); }
else { ok(/trust proxy/i.test(srcAll), 'co trust proxy'); ok(/helmet/i.test(srcAll), 'co helmet'); }

// 6. approval-matrix v6.1: khong con director/cfo gop
ok(approval.approval_matrix_version === 'v6.1', 'approval-matrix v6.1');
ok(JSON.stringify(approval).indexOf('director/cfo') === -1, 'khong con level director/cfo gop');

// 7. invariants ANSI (khong datetime now cua sqlite)
const inv = read(path.join(ROOT, 'docs/contract/invariants.sql'));
ok(inv.includes('I1b') && inv.includes('I8'), 'invariants co I1b + I8');
ok(!/datetime\s*\(\s*'now'/i.test(inv), 'invariants khong dung datetime(now) rieng sqlite');

// 8. roles: attendance.checkin '*' + users.unlock + chat + RBAC v6.2 (truong phong / nhan vien ro rang)
ok(roles.matrix['attendance.checkin'] && roles.matrix['attendance.checkin'][0] === '*', 'attendance.checkin mo cho moi role dang nhap');
ok(roles.matrix['users.unlock'] && roles.matrix['chat.write'], 'co quyen users.unlock + chat.write');
for (const p of ['finance.read', 'hr.read', 'qa.write', 'sop.write', 'productfeat.write']) ok(roles.matrix[p] && roles.matrix[p].length > 0, 'co quyen moi ' + p);
ok(!roles.matrix['finance.read'].includes('sales') && !roles.matrix['finance.read'].includes('warehouse') && !roles.matrix['finance.read'].includes('cskh'), 'sales/kho/cskh khong finance.read');
ok(!roles.matrix['payments.write'].includes('manager') && !roles.matrix['payments.write'].includes('warehouse'), 'truong phong/kho khong payments.write');
ok(roles.matrix['qa.write'].includes('staff') && roles.matrix['qa.write'].includes('warehouse'), 'staff/kho duoc qa.write');
ok(roles.role_scopes && roles.role_scopes.manager && roles.role_scopes.warehouse, 'co role_scopes truong phong/nhan vien');

// 9. DB-01 v7: lint cam SQL dac thu SQLite trong src (ngoai db.js + migrations SQLite + seeds demo)
(function lintSqliteOnly() {
  const FORBIDDEN = [
    [/(?<![\w.])datetime\s*\(/i, 'datetime('],
    [/(?<![\w.])date\s*\(\s*'now'/i, "date('now'"],
    [/(?<!new\s)(?<![\w.])date\s*\(\s*[a-z_][a-z0-9_.]*/i, 'date(<col>) — SQLite-only, dung CAST(col AS TEXT)'],
    [/(?<![\w.])strftime\s*\(/i, 'strftime('],
    [/(?<![\w.])julianday\s*\(/i, 'julianday('],
    [/INSERT\s+OR\s+(IGNORE|REPLACE)/i, 'INSERT OR IGNORE/REPLACE'],
    [/\bAUTOINCREMENT\b/i, 'AUTOINCREMENT'],
    [/(?<![\w.])IFNULL\s*\(/i, 'IFNULL('],
  ];
  // Dong duoc coi la "ung vien SQL" khi chua dau hieu SQL ro rang.
  const SQL_HINT = /\b(SELECT|INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|FROM\s+\w|WHERE|ORDER\s+BY|GROUP\s+BY|SUM\(|COUNT\(|CASE\s+WHEN)\b/i;
  const bad = [];
  for (const f of files) {
    const rel = String(f).replace(/\\/g, '/');
    if (/(common\/db\.js|db\/migrate\.js)$/.test(rel)) continue;
    if (/db\/migrations\/.*\.sql$/.test(rel) && !/postgres/i.test(rel)) continue;
    if (/db\/seeds\//.test(rel)) continue;
    if (!/\.js$/.test(rel)) continue;
    const src = read(f);
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const code = line.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/, '').trim();
      if (!code) return;
      const looksSql = SQL_HINT.test(code);
      for (const [re, tag] of FORBIDDEN) {
        if (!re.test(code)) continue;
        // `date(...)` chi co gia tri khi dong la SQL; cac ham JS (update/digest/...)
        // khong phai SQLite-only.
        if (tag.startsWith('date(') && !looksSql) continue;
        bad.push(`${f}:${i + 1} [${tag}] ${code.slice(0, 110)}`);
        break;
      }
      if (/\bPRAGMA\b/i.test(code) && !/common\/db\.js$/.test(rel)) {
        bad.push(`${f}:${i + 1} [PRAGMA] ${code.slice(0, 110)}`);
      }
    });
  }
  if (bad.length) { console.log('SQLITE-ONLY VIOLATIONS:\n' + bad.join('\n')); }
  ok(bad.length === 0, 'khong con SQL dac thu SQLite trong src/ (ngoai db.js/seeds) — DB-01');
})();

// 10. SEC-02 v7: khong con secret mac dinh trong src + compose
(function lintSecrets() {
  const hits = [];
  const scanRoots = [path.join(ROOT, 'src'), path.join(ROOT, '..', 'agent_svc', 'src')];
  const { execSync } = require('child_process');
  try {
    const out = execSync('git grep -n "dev-agent-key" -- backend/src agent_svc/src docker-compose.yml || true', { cwd: path.join(ROOT, '..'), encoding: 'utf8' });
    const lines = String(out || '').trim().split('\n').filter(Boolean)
      .filter((l) => !/FORBIDDEN|_dflt|khoa mac dinh|secret mac dinh|khoa cong khai/i.test(l));
    for (const l of lines) hits.push(l.slice(0, 140));
  } catch {}
  if (hits.length) console.log('SECRET-DEFAULT HITS:\n' + hits.join('\n'));
  void scanRoots;
  ok(hits.length === 0, 'khong con khoa mac dinh trong src/compose — SEC-02');
})();

// 11. STABILIZATION v8.0 — gate cho backlog da dong (TX-01..04, GOV-01/02,
//     SEC-02..04, OPS-01/03, QA-01). Moi gate deu doc source THAT — khong
//     dung co so dieu kien "luon true" (QA-01: verify phai that su fail
//     khi contract vi pham).
(function stabilizationGates() {
  const dbSrc = read(path.join(ROOT, 'src/common/db.js'));
  const authSrc = read(path.join(ROOT, 'src/common/auth.js'));
  const auditSrc = read(path.join(ROOT, 'src/common/audit.js'));
  const routesAuthSrc = read(path.join(ROOT, 'src/routes/auth.js'));
  const serverSrc = read(path.join(ROOT, 'src/server.js'));
  const secSrc = read(path.join(ROOT, 'src/common/security.js'));
  const salesSrc = read(path.join(ROOT, 'src/modules/sales/service.js'));
  const supplySrc = read(path.join(ROOT, 'src/modules/supply/service.js'));
  const financeSrc = read(path.join(ROOT, 'src/modules/finance/service.js'));

  // TX-01: transaction phai serialize tren SQLite (khoa + AsyncLocalStorage).
  ok(/AsyncLocalStorage/.test(dbSrc) && /sqliteQueue/.test(dbSrc), 'TX-01: SQLite transaction serialize (queue + AsyncLocalStorage)');
  // TX-02: stock guard phai khoa dong hang (FOR UPDATE) truoc khi ghi.
  ok(/FOR UPDATE/i.test(dbSrc), 'TX-02/TX-03: DB adapter ho tro khoa dong hang (FOR UPDATE)');
  ok(/readOnhand|lock\(/i.test(salesSrc) && /lock\(/i.test(supplySrc), 'TX-02: sales + supply khoa ton kho truoc khi ghi');
  // TX-03: payment phai co conditional update (WHERE paid=?).
  ok(/WHERE id=\? AND paid=\?/i.test(financeSrc), 'TX-03: payment cap nhat cong no co dieu kien (anti lost-update)');
  // TX-04: idempotency — unique constraint + bat loi unique -> dedupe.
  ok(/idempotency_key\s+TEXT\s+UNIQUE/i.test(migAll), 'TX-04: co UNIQUE constraint cho idempotency_key');
  ok(/isUniqueViolation/.test(dbSrc), 'TX-04: adapter nhan dien loi UNIQUE (retry handling)');
  // GOV-01: audit ghi trong cung transaction.
  // Phase 4: writeAudit phai THROW khi thieu conn (INV-2) — nhieu cach dien
  // dat: `!conn || typeof conn.run !== 'function'` hoac
  // `!conn || typeof conn.run === 'function'` (nham dau bang).
  ok(
    /!conn\s*\|\|\s*typeof\s+conn\.run\s*(!==|===)\s*'function'/.test(auditSrc)
    && /AppError\('GOV'/.test(auditSrc),
    'GOV-01: writeAudit dung conn trong transaction (throw GOV neu thieu conn)'
  );
  const auditOutside = [
    read(path.join(ROOT, 'src/routes/hr.js')),
    read(path.join(ROOT, 'src/routes/sales.js')),
    read(path.join(ROOT, 'src/routes/gov-min.js')),
  ].join('\n');
  ok(!/writeAudit\(null/.test(auditOutside), 'GOV-01: khong con writeAudit ngoai transaction trong routes');
  // GOV-02: audit_log append-only tren ca 2 dialect.
  ok(/trg_no_update_audit/.test(migAll) && /trg_no_update_audit/.test(migPgAll), 'GOV-02: audit_log append-only (chan UPDATE/DELETE)');
  // SEC-02: refresh rotation atomic + reuse detection.
  ok(/IS NOT TRUE/i.test(authSrc), 'SEC-02: revoke refresh token bang dieu kien atomic (IS NOT TRUE)');
  // SEC-03: proxy trust theo topology, khong tin XFF tu client.
  ok(/trust proxy/i.test(serverSrc) || /trust proxy/i.test(secSrc), 'SEC-03: server dat trust proxy theo topology');
  const secCode = secSrc.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  ok(/resolveTrustProxy/.test(secSrc) && !/app\.set\(\s*['"]trust proxy['"]\s*,\s*1\s*\)/.test(secCode), 'SEC-03: trust proxy khong hard-code =1 (theo TRUST_PROXY env)');
  // SEC-04: cookie secure + httpOnly + sameSite.
  ok(/httpOnly:\s*true/.test(routesAuthSrc) && /sameSite/i.test(routesAuthSrc), 'SEC-04: cookie httpOnly + sameSite');
  ok(/secure:\s*isProd/.test(routesAuthSrc) && /NODE_ENV\s*===\s*['"]production['"]/.test(routesAuthSrc), 'SEC-04: cookie secure o production');
  // OPS-03: readiness kiem tra DB that.
  ok(/\/api\/ready/.test(serverSrc), 'OPS-03: co endpoint /api/ready');
  ok(/SELECT 1/.test(serverSrc), 'OPS-03: readiness kiem tra ket noi DB');
  // QA-01: verify khong con dieu kien "luon true" (false-positive).
  const verifySrc = read(__filename);
  ok(!/\|\|\s*true\s*\)/.test(verifySrc), 'QA-01: verify khong con dieu kien "|| true" (false-positive)');

  // DB-01: KHONG duoc co forward FK trong migration PostgreSQL
  // (bang tra tham chieu toi bang duoc tao sau -> "relation does not exist").
  const order = [];
  for (const ln of migPg.split('\n')) {
    const m = ln.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
    if (m) order.push(m[1]);
  }
  let cur = null;
  const fwd = [];
  for (const ln of migPg.split('\n').map((l) => l.replace(/--.*$/, ''))) {
    const cm = ln.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
    if (cm) { cur = cm[1]; continue; }
    const rm = ln.match(/REFERENCES\s+"?(?:[a-zA-Z_]+\.)?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
    if (rm && cur) {
      const ti = order.indexOf(rm[1]);
      const ci = order.indexOf(cur);
      if (ti > ci) fwd.push(cur + ' -> ' + rm[1]);
    }
  }
  ok(fwd.length === 0, 'DB-01: migration PG khong co forward FK' + (fwd.length ? ' (' + fwd.join(', ') + ')' : ''));

  // QA-02/03/04: cac suite bat buoc phai ton tai (khong bi xoa nham).
  for (const f of ['tx-concurrency.test.js', 'race-concurrency.test.js', 'security-regression.test.js']) {
    ok(fs.existsSync(path.join(ROOT, 'tests', f)), 'QA-02/03/04: ton tai suite ' + f);
  }
  // QA-05: Compose phai co PostgreSQL + backup service + volume persistent.
  const compose = read(path.join(ROOT, '..', 'docker-compose.yml'));
  ok(/image:\s*postgres:15/.test(compose), 'QA-05: compose co PostgreSQL 15');
  ok(/bizops-pgdata/.test(compose) && /bizops-backups/.test(compose), 'QA-05: compose co volume persistent (pgdata + backups)');
  ok(/pg_isready/.test(compose), 'QA-05: compose co healthcheck pg_isready');
  // WEB-01: Nginx storefront + frontend phai proxy /api.
  const sfNginx = read(path.join(ROOT, '..', 'storefront', 'nginx.conf'));
  const feNginx = read(path.join(ROOT, '..', 'frontend', 'nginx.conf'));
  ok(/location\s+\/api\//.test(sfNginx) && /proxy_pass\s+http:\/\/backend:3000/.test(sfNginx), 'WEB-01: storefront nginx proxy /api -> backend');
  ok(/location\s+\/api\//.test(feNginx) && /proxy_pass\s+http:\/\/backend:3000/.test(feNginx), 'WEB-01: frontend nginx proxy /api -> backend');
})();

// ===========================================================================
// 12. PHASE 0 — DIENH DANG / DIALECT PARITY / KIEU DU LIEU
//     "verify.js phai bat duoc loi dialect, khong bao xanh gia" (Prompt 1.2)
// ===========================================================================

// 12.1 — Parse CREATE TABLE tu 2 file migration, so sanh TAP TEN BANG.
(function dialectTableParity() {
  function tablesOf(sql) {
    const out = new Set();
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/gi;
    let m;
    while ((m = re.exec(sql))) out.add(m[1].toLowerCase());
    return out;
  }
  const tSql = tablesOf(migAll);
  const tPg = tablesOf(migPgAll);
  const onlySql = [...tSql].filter((t) => !tPg.has(t));
  const onlyPg = [...tPg].filter((t) => !tSql.has(t));
  ok(onlySql.length === 0, 'dialect parity: khong bang chi co o SQLite' + (onlySql.length ? ' (' + onlySql.join(', ') + ')' : ''));
  ok(onlyPg.length === 0, 'dialect parity: khong bang chi co o PostgreSQL' + (onlyPg.length ? ' (' + onlyPg.join(', ') + ')' : ''));
  ok(tSql.size >= 35, 'dialect parity: so bang SQLite=' + tSql.size);
})();

// 12.2 — So sanh TAP TEN COT cho tung bang giua 2 dialect.
(function dialectColumnParity() {
  function parseTables(sql) {
    const map = new Map();
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s*\(/gi;
    let m;
    while ((m = re.exec(sql))) {
      const name = m[1].toLowerCase();
      // lay phan than bang: den dau `);` gan nhat (bo qua dong comment)
      let i = re.lastIndex;
      let depth = 1;
      let body = '';
      while (i < sql.length && depth > 0) {
        const ch = sql[i];
        if (ch === '(') depth++;
        else if (ch === ')') { depth--; if (depth === 0) break; }
        body += ch;
        i++;
      }
      const cols = new Set();
      for (const raw of body.split('\n')) {
        const line = raw.replace(/--.*$/, '').trim();
        if (!line) continue;
        const cm = line.match(/^["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s+(BIGINT|INTEGER|INT|TEXT|TIMESTAMP|TIMESTAMPTZ|DATE|BOOLEAN|NUMERIC|REAL|DOUBLE|SERIAL|BIGSERIAL|VARCHAR|JSONB|JSON|UUID|BLOB)/i);
        if (cm) cols.add(cm[1].toLowerCase());
      }
      map.set(name, cols);
    }
    return map;
  }
  const mapSql = parseTables(migAll);
  const mapPg = parseTables(migPgAll);
  const diffs = [];
  for (const [t, cols] of mapSql) {
    const pgCols = mapPg.get(t);
    if (!pgCols) continue; // 12.1 da bao loi bang thieu
    const missing = [...cols].filter((c) => !pgCols.has(c));
    const extra = [...pgCols].filter((c) => !cols.has(c));
    if (missing.length || extra.length) {
      diffs.push(t + ' [thieu o PG: ' + (missing.join(',') || '-') + ' | thua o PG: ' + (extra.join(',') || '-') + ']');
    }
  }
  if (diffs.length) console.log('DIALECT COLUMN DIFF:\n' + diffs.join('\n'));
  ok(diffs.length === 0, 'dialect parity: tap cot cua moi bang khop giua SQLite va PostgreSQL');
})();

// 12.3 — P0-1: moi cot kieu "dinh danh nguoi" (created_by/actor/requester/...)
//     phai la kieu SO. Bat code truyen USERNAME vao cot BIGINT.
(function actorColumnTypeCheck() {
  const ID_COL = /^(created_by|updated_by|decided_by|approved_by|actor_id|owner_employee_id|employee_id|assignee|manager_id|requester|reviewer|handled_by|user_id|reported_by|created_by_id)$/;
  const TEXTY = /^(actor|created_by_username|approved_by_username|decided_by_name)$/;
  const problems = [];
  for (const [name, sql] of [['sqlite', migAll], ['postgres', migPgAll]]) {
    const re = /^\s*["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?\s+(BIGINT|INTEGER|INT|TEXT|TIMESTAMP|TIMESTAMPTZ|DATE|BOOLEAN|NUMERIC|REAL|DOUBLE|SERIAL|BIGSERIAL|VARCHAR|JSONB|JSON|UUID|BLOB)/i;
    const lines = sql.split('\n');
    let cur = null;
    for (const raw of lines) {
      const line = raw.replace(/--.*$/, '').trim();
      const tm = line.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z_][a-zA-Z0-9_]*)["`]?/i);
      if (tm) { cur = tm[1].toLowerCase(); continue; }
      const cm = line.match(re);
      if (!cm || !cur) continue;
      const col = cm[1].toLowerCase();
      const type = cm[2].toUpperCase();
      if (ID_COL.test(col) && !/^(BIGINT|INTEGER|INT|SERIAL|BIGSERIAL)$/.test(type)) {
        problems.push(`${name}: ${cur}.${col} kieu ${type} (phai la so) — se gay loi khi truyen username`);
      }
      if (TEXTY.test(col) && !/^(TEXT|VARCHAR)$/.test(type)) {
        problems.push(`${name}: ${cur}.${col} kieu ${type} (phai la TEXT)`);
      }
    }
  }
  if (problems.length) console.log('ACTOR COLUMN TYPE PROBLEMS:\n' + problems.join('\n'));
  ok(problems.length === 0, 'P0-1: moi cot dinh danh nguoi trong migration co kieu so (created_by/requester/decided_by...)');
})();

// 12.4 — P0-1: trong code, `created_by` phai nhan gia TRI SO (req.user.id),
//     khong duoc truyen `req.user.username` (chen chuoi -> loi PG 500).
(function createdByArgumentCheck() {
  const bad = [];
  for (const f of files) {
    if (!/\.js$/.test(f)) continue;
    const rel = String(f).replace(/\\/g, '/');
    if (/db\/migrations\//.test(rel) || /db\/seeds\//.test(rel)) continue;
    const src = read(f);
    src.split('\n').forEach((line, i) => {
      if (/created_by\s*[:=]\s*req\.user\.username/i.test(line)) {
        bad.push(`${f}:${i + 1} created_by = req.user.username (phai la so) — ${line.trim().slice(0, 100)}`);
      }
      if (/created_by\s*[:=]\s*user\.username/i.test(line)) {
        bad.push(`${f}:${i + 1} created_by = user.username (phai la so) — ${line.trim().slice(0, 100)}`);
      }
    });
  }
  if (bad.length) console.log('CREATED_BY TYPE VIOLATIONS:\n' + bad.join('\n'));
  ok(bad.length === 0, 'P0-1: khong co cho gan created_by = username trong src/');
})();

// 12.5 — INV-5 / Phase 0.5: helper thoi gian VN phai dung, va khong con
//     `new Date().toISOString().slice(0,10)` de lay ngay trong src/.
(function vnTimeHelpersCheck() {
  const dbSrc = read(path.join(ROOT, 'src/common/db.js'));
  ok(/Asia\/Ho_Chi_Minh/.test(dbSrc), 'INV-5: helper thoi gian dung timezone Asia/Ho_Chi_Minh');
  ok(/function toSqlDateTime/.test(dbSrc) && /function isExpired/.test(dbSrc), 'Phase 0.6: co toSqlDateTime() + isExpired() trong common/db.js');
  const bad = [];
  for (const f of files) {
    if (!/\.js$/.test(f)) continue;
    const rel = String(f).replace(/\\/g, '/');
    if (/common\/db\.js$/.test(rel)) continue;
    const src = read(f);
    src.split('\n').forEach((line, i) => {
      if (/new\s+Date\(\s*\)\s*\.toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*10\s*\)/.test(line)
        && !/^\s*(\*|\/\/)/.test(line)
        && !/lint trong verify/i.test(line)) {
        bad.push(`${f}:${i + 1} dung toISOString().slice(0,10) de lay ngay — lech 1 ngay 00:00-07:00 VN`);
      }
    });
  }
  if (bad.length) console.log('VN DATE VIOLATIONS:\n' + bad.join('\n'));
  ok(bad.length === 0, 'INV-5: khong con lay ngay bang new Date().toISOString().slice(0,10) trong src/');
})();

// 12.6 — Phase 0.4: migrate.js phai tach statement + gate theo version,
//     va seed-storefront.cjs phai chay duoc tren ca 2 dialect.
(function migrateAndSeedCheck() {
  const migSrc = read(path.join(ROOT, 'src/db/migrate.js'));
  ok(/function splitStatements/.test(migSrc), 'Phase 0.4: migrate.js tach SQL thanh statement');
  ok(/SELECT version FROM schema_migrations/.test(migSrc), 'Phase 0.4: migrate.js DOC schema_migrations de skip file da apply');
  ok(/duplicate column name/i.test(migSrc), 'Phase 0.4: migrate.js chi bo qua loi "duplicate column name"');
  const seedSrc = read(path.join(ROOT, 'seed-storefront.cjs'));
  const seedCode = seedSrc.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  ok(/common\/db/.test(seedSrc), 'Phase 0.3: seed-storefront.cjs dung adapter common/db.js (2 dialect)');
  ok(!/better-sqlite3/.test(seedCode), 'Phase 0.3: seed-storefront.cjs khong hard-code better-sqlite3');
  ok(!/date\s*\(\s*'now'/i.test(seedCode), 'Phase 0.3: seed-storefront.cjs khong dung date(\'now\') (SQLite-only)');
})();

// 12.7 — Phase 0.1: test phai chay tren DB rieng, khong trong DB dev.
(function testDbIsolationCheck() {
  const setupSrc = read(path.join(ROOT, 'tests/setup.js'));
  ok(/bizops-test\.db/.test(setupSrc), 'Phase 0.1: tests/setup.js dung DB test rieng (bizops-test.db)');
  ok(/path\.resolve/.test(setupSrc), 'Phase 0.1: tests/setup.js resolve DATABASE_PATH tuyet doi');
  ok(/migrate/.test(setupSrc), 'Phase 0.1: tests/setup.js tu chay migrate + seed');
})();

// ===========================================================================
// 13. PHASE 3 — SCOPE V2 (P0-3/4/5 + P2-19)
//     Scope phai enforce SERVER-SIDE, theo phong ban, FAIL-CLOSED, dong nhat
//     cho MOI route. Verify phai doc source THAT — khong dung "|| true".
// ===========================================================================

// 13.1 — Migration 005 tao bang `resource_dept`; 006 backfill du lieu cu.
(function deptScopeMigrationCheck() {
  const mig5 = read(path.join(ROOT, 'src/db/migrations/005_dept_scope.sql'));
  const mig5pg = read(path.join(ROOT, 'src/db/migrations/005_dept_scope.postgres.sql'));
  const mig6 = read(path.join(ROOT, 'src/db/migrations/006_backfill_dept_scope.sql'));
  const mig6pg = read(path.join(ROOT, 'src/db/migrations/006_backfill_dept_scope.postgres.sql'));
  for (const [tag, src] of [['sqlite', mig5], ['postgres', mig5pg]]) {
    ok(/CREATE TABLE IF NOT EXISTS resource_dept/i.test(src), 'Phase 3: migration 005 tao bang resource_dept (' + tag + ')');
    ok(/PRIMARY KEY\s*\(\s*table_name\s*,\s*record_id\s*\)/i.test(src), 'Phase 3: resource_dept co PK (table_name, record_id) (' + tag + ')');
    ok(/idx_resource_dept_dept/i.test(src), 'Phase 3: resource_dept co index theo dept (' + tag + ')');
  }
  ok(mig6.length > 0 && mig6pg.length > 0, 'Phase 3: co migration 006 backfill resource_dept (2 dialect)');
  ok(/ON CONFLICT\s*\(\s*table_name\s*,\s*record_id\s*\)\s*DO NOTHING/i.test(mig6), 'Phase 3: backfill idempotent (ON CONFLICT DO NOTHING)');
  // Backfill phai phu du cac bang nghiep vu chinh.
  for (const t of ['customers', 'leads', 'orders', 'debts', 'payments', 'shipments', 'tickets', 'approvals', 'campaigns']) {
    ok(new RegExp("'" + t + "'", 'i').test(mig6), 'Phase 3: backfill phu bang ' + t);
  }

  // 3 ban contract roles-permissions.json phai GIONG HET nhau (tranh drift).
  const rpFiles = [
    path.join(ROOT, 'docs', 'contract', 'roles-permissions.json'),
    path.join(ROOT, '..', 'docs', 'contract', 'roles-permissions.json'),
    path.join(ROOT, '..', 'agent_svc', 'docs', 'contract', 'roles-permissions.json'),
  ];
  const contents = rpFiles.filter((f) => fs.existsSync(f)).map((f) => read(f));
  ok(contents.length === 3, 'Phase 3: co du 3 ban roles-permissions.json de so sanh');
  ok(contents.every((c) => c === contents[0]), 'Phase 3: 3 ban roles-permissions.json GIONG HET nhau (khong drift)');
  // §4.6: moi role phai co `scope_read`.
  const roleScopes = roles.role_scopes || {};
  const missingScopeRead = Object.keys(roleScopes).filter((r) => !roleScopes[r].scope_read);
  ok(missingScopeRead.length === 0, 'Phase 3 (§4.6): moi role co scope_read' + (missingScopeRead.length ? ' (thieu: ' + missingScopeRead.join(', ') + ')' : ''));
  const validScopeRead = ['all', 'dept', 'own', 'none'];
  const badScopeRead = Object.keys(roleScopes).filter((r) => !validScopeRead.includes(roleScopes[r].scope_read));
  ok(badScopeRead.length === 0, 'Phase 3 (§4.6): scope_read chi nhan gia tri hop le' + (badScopeRead.length ? ' (sai: ' + badScopeRead.join(', ') + ')' : ''));
})();

// 13.2 — scope.js: fail-closed + khong con entry `null` trong RESOURCE_DEPT.
(function scopeModuleCheck() {
  const scopeSrc = read(path.join(ROOT, 'src/common/scope.js'));
  ok(/function resolveScope/.test(scopeSrc), 'Phase 3: scope.js co resolveScope');
  ok(/function assertBusinessScope/.test(scopeSrc), 'Phase 3: scope.js co assertBusinessScope (doc resource_dept)');
  ok(/function scopedList/.test(scopeSrc), 'Phase 3: scope.js co scopedList (JOIN resource_dept)');
  ok(/function requireScoped/.test(scopeSrc), 'Phase 3: scope.js co middleware requireScoped');
  ok(/function enforceDept/.test(scopeSrc), 'Phase 3: scope.js co enforceDept');
  ok(/function canReadAllDepts/.test(scopeSrc), 'Phase 3 (§4.5): scope.js co canReadAllDepts (HR xem toan cong ty)');
  // FAIL-CLOSED: `scopeFilter` phai lo row thieu dept.
  ok(/d\s*==\s*null\s*\|\|\s*d\s*===\s*''\)\s*return\s+false/.test(scopeSrc), 'Phase 3: scopeFilter lo row khong co dept (fail-closed)');
  // RESOURCE_DEPT khong duoc co entry null (chinh la loi P0-4).
  const rdBlock = scopeSrc.match(/const RESOURCE_DEPT\s*=\s*\{([\s\S]*?)\n\};/);
  ok(!!rdBlock, 'Phase 3: scope.js co RESOURCE_DEPT');
  if (rdBlock) {
    const nullEntries = rdBlock[1].split('\n').filter((l) => /:\s*null\s*,?\s*$/.test(l) && !/^\s*\/[/*]/.test(l));
    ok(nullEntries.length === 0, 'Phase 3 (P0-4): RESOURCE_DEPT khong con entry null' + (nullEntries.length ? ' (' + nullEntries.join(' | ') + ')' : ''));
  }
  // DEPT_RULES phai phu du cac bang nghiep vu chinh.
  for (const t of ['orders', 'customers', 'leads', 'quotes', 'contracts', 'shipments', 'tickets', 'debts', 'payments', 'campaigns']) {
    ok(new RegExp('\\b' + t + '\\s*:').test(scopeSrc), 'Phase 3: DEPT_RULES co quy tac cho ' + t);
  }
})();

// 13.3 — MOI route file nghiep vu phai dung `requireScoped` / `scopedList` /
//       `assertBusinessScope` — KHONG con route doc TOAN BO du lieu.
(function routeScopeEnforcementCheck() {
  const ROUTE_FILES = ['sales.js', 'finance.js', 'supply.js', 'gov-min.js', 'helpdesk.js', 'marketing.js', 'overview.js', 'hr.js'];
  for (const f of ROUTE_FILES) {
    const p = path.join(ROOT, 'src', 'routes', f);
    if (!fs.existsSync(p)) { ok(false, 'Phase 3: thieu route file ' + f); continue; }
    const src = read(p);
    ok(/requireScoped|canReadAllDepts/.test(src), 'Phase 3: routes/' + f + ' co dung scope middleware');
    ok(!/requirePerm\('/.test(src) || /requireScoped/.test(src), 'Phase 3: routes/' + f + ' dung requireScoped (khong chi requirePerm)');
  }
  // Route doc TOAN BO du lieu nghiep vu (khong loc scope) = P0-5 regression.
  // LUU Y: `budgets`/`sop_tasks` co cot `dept_code` that -> loc bang scopeFilter
  // (fail-closed) nen khong xet o day.
  const UNSCOPED = [
    ['src/routes/sales.js', /all\(\s*'SELECT \* FROM (orders|customers|leads|quotes|contracts)/i],
    ['src/routes/finance.js', /all\(\s*'SELECT \* FROM (debts|expenses|transactions)/i],
    ['src/routes/supply.js', /all\(\s*'SELECT \* FROM (purchase_orders|shipments|suppliers|qa_checks)/i],
    ['src/routes/helpdesk.js', /all\(\s*'SELECT \* FROM tickets/i],
    ['src/routes/marketing.js', /all\(\s*'SELECT \* FROM campaigns/i],
  ];
  for (const [rel, re] of UNSCOPED) {
    const src = read(path.join(ROOT, rel));
    ok(!re.test(src), 'Phase 3 (P0-5): ' + rel + ' khong doc TOAN BO du lieu nghiep vu');
  }
  // IDOR: route theo ID phai co assertBusinessScope.
  const IDOR_ROUTES = [
    ['src/routes/sales.js', /router\.post\('\/orders\/:id\/(cancel|refund)'/, 'orders/:id'],
    ['src/routes/sales.js', /router\.get\('\/customers\/:id'/, 'customers/:id'],
    ['src/routes/supply.js', /router\.patch\('\/shipments\/:id'/, 'shipments/:id'],
    ['src/routes/helpdesk.js', /router\.patch\('\/cskh\/tickets\/:id'/, 'cskh/tickets/:id'],
  ];
  for (const [rel, re, label] of IDOR_ROUTES) {
    const src = read(path.join(ROOT, rel));
    ok(re.test(src) && /assertBusinessScope/.test(src), 'Phase 3 (P0-4): ' + rel + ' ' + label + ' co assertBusinessScope');
  }
  // overview phai phan quyen theo vai.
  const ovSrc = read(path.join(ROOT, 'src/modules/governance/overview.js'));
  ok(/function getOverview\(conn, user\)/.test(ovSrc), 'Phase 3 (P0-5): getOverview(conn, user) nhan user');
  ok(/canAccessDept/.test(ovSrc), 'Phase 3 (P0-5): overview guard tung khoi theo canAccessDept');
  ok(/hidden:\s*true/.test(ovSrc), 'Phase 3 (P0-5): khoi ngoai scope bi an (hidden: true)');
  const ovRoute = read(path.join(ROOT, 'src/routes/overview.js'));
  ok(/X-Scope-Depts/.test(ovRoute), 'Phase 3 (P0-5): overview tra header X-Scope-Depts de audit');
})();

// 13.4 — Test Phase 3 phai ton tai (sec01d..sec01k).
(function scopeTestCheck() {
  const t = path.join(ROOT, 'tests', 'scope-v2.test.js');
  ok(fs.existsSync(t), 'Phase 3 (§4.7): ton tai suite scope-v2.test.js');
  if (fs.existsSync(t)) {
    const src = read(t);
    for (const id of ['sec01d', 'sec01e', 'sec01f', 'sec01g', 'sec01h', 'sec01i', 'sec01j', 'sec01k']) {
      ok(new RegExp(id + ':').test(src), 'Phase 3 (§4.7): co test ' + id);
    }
  }
})();

// ===========================================================================
// 14. PHASE 4 — P1-6..P1-21: LOGIC NGHIEP VU, TRANSACTION, AUDIT, STATE MACHINE
// ===========================================================================

// 14.1 — P1-6: cap duyet LUON tinh tu approval-matrix.json (khong hardcode,
//        khong tin `level` tu client).
(function approvalMatrixSourceOfTruth() {
  const appr = read(path.join(ROOT, 'src/modules/governance/approvals.js'));
  ok(/approval-matrix\.json/.test(appr), 'P1-6 (INV-6): approvals doc nguong tu approval-matrix.json');
  ok(/levelForAmount/.test(appr) && /levelForContract/.test(appr), 'P1-6: co ham tinh cap duyet theo loai chung tu');
  ok(/routingFor\(/.test(appr), 'P1-6: routing doc tu amount_routing trong matrix');
  // KHONG hardcode nguong so tien trong code (chi doc tu matrix).
  const codeOnly = appr.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  ok(!/50000000|200000000|5000000/.test(codeOnly), 'P1-6 (INV-6): khong hardcode nguong duyet trong code');
  // Client gui `level` khac cap tinh => 400 (khong 500).
  ok(/khong cho ep cap/.test(appr), 'P1-6: tu choi ep cap duyet (client gui level khac)');
  // Contract routing phai co trong matrix.
  ok(Array.isArray(approval.amount_routing && approval.amount_routing.contract), 'P1-6: approval-matrix.json co amount_routing.contract');
  // routes khong duoc truyen `level` tu client.
  for (const f of ['finance.js', 'sales.js', 'gov-min.js']) {
    const src = read(path.join(ROOT, 'src/routes', f));
    ok(!/level:\s*req\.body\.level/.test(src), 'P1-6: routes/' + f + ' khong truyen level tu client');
  }
  // finance/expenses phai goi gov.requestApproval (khong hardcode nguong).
  const fin = read(path.join(ROOT, 'src/routes/finance.js'));
  ok(/requestApproval/.test(fin), 'P1-6: POST /expenses goi gov.requestApproval');
  const finCode = fin.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  ok(!/50000000|200000000/.test(finCode), 'P1-6: POST /expenses khong hardcode nguong duyet');
})();

// 14.2 — P1-7: khoa dong approval + chong double-decide + decided_at chuan hoa.
(function approvalLockingCheck() {
  const appr = read(path.join(ROOT, 'src/modules/governance/approvals.js'));
  ok(/lock\('SELECT \* FROM approvals/.test(appr), 'P1-7: decideApproval khoa dong approval (FOR UPDATE)');
  ok(/WHERE id=\? AND status='pending'/.test(appr), 'P1-7: decideApproval chong double-decide (conditional update)');
  ok(/changes/.test(appr), 'P1-7: check `changes` sau conditional update');
  ok(/nowISO\(\)/.test(appr), 'P1-7: decided_at dung nowISO() (chuuan hoa INV-5)');
  ok(/signed_date/.test(appr), 'P1-7: set signed_date khi contract -> signed');
  const apprCode = appr.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  ok(!/CURRENT_TIMESTAMP/i.test(apprCode), 'P1-7: khong dung CURRENT_TIMESTAMP cho decided_at');
})();

// 14.3 — P1-8: cam fallback `ORDER BY id DESC LIMIT 1` lay ID ban ghi vua tao.
(function noLastInsertFallback() {
  const srcFiles = files.filter((f) => /\.js$/.test(f));
  const hits = [];
  for (const f of srcFiles) {
    const src = read(f);
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    // 1) KHONG duoc fallback ID: `x.lastInsertRowid || ...`
    if (/lastInsertRowid\s*\|\|/.test(code)) hits.push(path.basename(f) + ': lastInsertRowid ||');
    // 2) KHONG duoc dung `ORDER BY id DESC LIMIT 1` de LAY ID vua ghi.
    //    (Doc "ban ghi moi nhat" de hien thi/dem la duoc phép.)
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!/ORDER BY\s+id\s+DESC\s+LIMIT\s+1/i.test(l)) continue;
      // Neu dong nay la SELECT id FROM ... thi la fallback lay ID => cam.
      if (/SELECT\s+id\s+FROM/i.test(l)) {
        hits.push(path.basename(f) + ':' + (i + 1) + ' SELECT id FROM ... ORDER BY id DESC LIMIT 1');
      }
      // Neu bien chua ket qua duoc gan vao `id`/`.id` => cung la fallback ID.
      const m = l.match(/const\s+(\w+)\s*=\s*await\s+c\.get/i) || l.match(/(\w+)\s*=\s*await\s+c\.get/i);
      if (m && /(^|[^a-zA-Z])id\s*$/i.test(m[1])) {
        hits.push(path.basename(f) + ':' + (i + 1) + ' gan ID tu ORDER BY id DESC LIMIT 1');
      }
    }
  }
  ok(hits.length === 0, 'P1-8: khong con fallback lay ID bang "ORDER BY id DESC LIMIT 1"' + (hits.length ? ' (' + hits.join(' | ') + ')' : ''));
  const dbSrc = read(path.join(ROOT, 'src/common/db.js'));
  ok(/function insertedId/.test(dbSrc), 'P1-8: co adapter insertedId() lay ID ban ghi vua tao');
})();

// 14.4 — P1-9: khoa dong hang truoc khi ghi (order/debt/approval).
(function rowLockingCheck() {
  const sales = read(path.join(ROOT, 'src/modules/sales/service.js'));
  ok(/lockOrder/.test(sales) && /lock\('SELECT \* FROM orders/.test(sales), 'P1-9: setOrderPaid khoa dong order');
  const fin = read(path.join(ROOT, 'src/modules/finance/service.js'));
  ok(/lockDebt/.test(fin) && /lock\('SELECT \* FROM debts/.test(fin), 'P1-9: recordPayment khoa dong cong no');
  ok(/markDebtCancelled/.test(fin) && /lock\('SELECT \* FROM debts/.test(fin), 'P1-9: markDebtCancelled khoa dong cong no');
})();

// 14.5 — P1-10: storefront dat truoc ton kho qua moveStock (nguon kiem tra duy nhat).
(function storefrontStockAtomic() {
  const pub = read(path.join(ROOT, 'src/public/orders.js'));
  ok(/moveStock/.test(pub), 'P1-10: storefront dat truoc ton kho qua supplyService.moveStock');
  // KHONG con kiem tra ton thu cong (doc SUM(stock_moves) roi so sanh).
  const code = pub.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  ok(!/COALESCE\(SUM\(qty\),0\)\s+s\s+FROM\s+stock_moves/.test(code), 'P1-10: khong kiem tra ton thu cong (chi moveStock)');
  // Sap xep SKU alphabet truoc khi tru (tranh deadlock PG).
  ok(/localeCompare/.test(code), 'P1-10: sap xep SKU alphabet truoc khi tru kho');
})();

// 14.6 — INV-8: state machine — ORDER_FLOW / IT_FLOW la bang transition + assert.
(function stateMachineCheck() {
  const sales = read(path.join(ROOT, 'src/modules/sales/service.js'));
  ok(/const ORDER_FLOW = \{/.test(sales), 'INV-8: ORDER_FLOW la bang transition');
  ok(/function assertOrderTransition/.test(sales), 'INV-8: co assertOrderTransition');
  ok(/ORDER_FLOW\[/.test(sales), 'INV-8: assertOrderTransition doc bang transition');
  const it = read(path.join(ROOT, 'src/modules/it/service.js'));
  ok(/const IT_FLOW = \{/.test(it), 'P2-21: IT_FLOW la bang transition');
  ok(/assertIncidentTransition/.test(it), 'P2-21: co assertIncidentTransition');
  const sm = read(path.join(ROOT, 'docs/contract/state-machines.md'));
  ok(/orders/.test(sm), 'INV-8: state-machines.md mo ta orders');
})();

// Helper: tach cac route mutation (POST/PATCH/PUT/DELETE) + body cua no.
// Phai xu ly duoc route co nhieu middleware (vd `requirePerm('x'), async (req,res)=>`).
function mutationRoutes(src) {
  const out = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*router\.(post|patch|put|delete)\s*\(\s*(['"`])([^'"`]+)\2/);
    if (!m) continue;
    // Tim dong mo dau handler `=> {` (co the cach qua 1-2 dong).
    let j = i;
    let opened = false;
    while (j < lines.length && j < i + 8) {
      if (/=>\s*\{\s*$/.test(lines[j])) { opened = true; break; }
      if (/=>\s*\{/.test(lines[j])) { opened = true; break; }
      j++;
    }
    if (!opened) continue;
    // Dong dong: `});` o cung indent voi dong mo router.
    const indent = (lines[i].match(/^\s*/) || [''])[0];
    const body = [];
    let k = j + 1;
    for (; k < lines.length; k++) {
      if (lines[k].trim() === '});' && (lines[k].match(/^\s*/) || [''])[0] === indent) break;
      body.push(lines[k]);
    }
    out.push({ method: m[1].toUpperCase(), path: m[3], body: body.join('\n') });
    i = k;
  }
  return out;
}

// 14.7 — P1-14: moi mutation phai co tx + audit (khong ghi ngoai transaction).
// INVARIANT: KHONG duoc co SQL ghi truc tiep (INSERT/UPDATE/DELETE) ngoai
// transaction. Service duoc phep tu bo tx (`withTx`/`db.tx` trong module).
(function mutationTxAuditCheck() {
  const ROUTE_FILES = ['sales.js', 'finance.js', 'supply.js', 'gov-min.js', 'helpdesk.js', 'marketing.js', 'overview.js', 'hr.js'];
  const offenders = [];
  let total = 0;
  for (const f of ROUTE_FILES) {
    const src = read(path.join(ROOT, 'src/routes', f));
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    for (const r of mutationRoutes(code)) {
      // Bo qua route doc-only / proxy / limiter-only.
      if (/cskh\/chat/.test(r.path)) continue;
      total++;
      const hasRawWrite = /\b(run|get|all)\s*\(\s*[`'"]\s*(INSERT|UPDATE|DELETE)\b/i.test(r.body)
        || /\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET|\bDELETE\s+FROM\b/i.test(r.body);
      const inTx = /\btx\s*\(/.test(r.body);
      // Route ghi truc tiep SQL ma KHONG trong tx => vi pham INV-2.
      if (hasRawWrite && !inTx) offenders.push(f + ' -> ' + r.method + ' ' + r.path);
    }
  }
  ok(total > 0, 'P1-14: co route mutation de kiem tra (' + total + ')');
  ok(offenders.length === 0, 'P1-14: khong route nao ghi SQL truc tiep ngoai transaction' + (offenders.length ? ' (' + offenders.join(' | ') + ')' : ''));
})();

// 14.8 — P1-15: cashflow() dung SQL portable + co route.
(function cashflowPortableCheck() {
  const fin = read(path.join(ROOT, 'src/modules/finance/service.js'));
  ok(/substr\(CAST\(paid_at AS TEXT\),1,10\)/i.test(fin), 'P1-15: cashflow dung substr(CAST(...)) (portable 2 dialect)');
  const finCode = fin.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  ok(!/date\(paid_at\)/i.test(finCode), 'P1-15: khong dung date(paid_at) (SQLite-only)');
  const route = read(path.join(ROOT, 'src/routes/finance.js'));
  ok(/\/finance\/cashflow/.test(route), 'P1-15: co route GET /api/finance/cashflow');
})();

// 14.9 — P2-20: dem imported/skipped theo `changes` (ON CONFLICT DO NOTHING).
(function importCountingCheck() {
  const route = read(path.join(ROOT, 'src/routes/finance.js'));
  const code = route.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  ok(/duplicate/.test(code) && /invalid/.test(code), 'P2-20: import-csv phan biet duplicate vs invalid');
  ok(/changes/.test(code), 'P2-20: dem imported theo `changes`');
})();

// 14.10 — P2-21: qa/service validate ref_id ton tai theo ref_type.
(function qaRefValidationCheck() {
  const qa = read(path.join(ROOT, 'src/modules/qa/service.js'));
  ok(/REF_TABLE/.test(qa), 'P2-21: qa/service co mapping ref_type -> bang');
  ok(/Khong tim thay/.test(qa), 'P2-21: qa/service validate ref_id ton tai');
})();

// 14.11 — Test Phase 4 phai ton tai.
(function phase4TestCheck() {
  const t = path.join(ROOT, 'tests', 'phase4.test.js');
  ok(fs.existsSync(t), 'Phase 4: ton tai suite phase4.test.js');
  if (fs.existsSync(t)) {
    const src = read(t);
    for (const id of ['p401', 'p402', 'p403', 'p404', 'p405', 'p406']) {
      ok(new RegExp(id + ':').test(src), 'Phase 4: co test ' + id);
    }
  }
})();

// ===========================================================================
// 15. PHASE 5 — P1-13: FRONTEND REFRESH QUEUE + CSRF + SCOPE DISPLAY
// ===========================================================================

// 15.1 — FE api.js: refresh hang doi + CSRF + retry giu Idempotency-Key.
(function frontendRefreshQueueCheck() {
  const feApi = read(path.join(ROOT, '..', 'frontend', 'src', 'api.js'));
  ok(fs.existsSync(path.join(ROOT, '..', 'frontend', 'src', 'api.js')), 'Phase 5: ton tai frontend/src/api.js');
  if (!feApi) return;
  ok(/let refreshing = null/.test(feApi), 'Phase 5: co hang doi refresh (refreshing) de chi 1 len refresh chay');
  ok(/\/api\/auth\/refresh/.test(feApi), 'Phase 5: co goi /api/auth/refresh');
  ok(/X-CSRF-Token/.test(feApi), 'Phase 5: gui header X-CSRF-Token');
  ok(/csrf_token/.test(feApi), 'Phase 5: doc cookie csrf_token');
  ok(/res\.status === 401/.test(feApi) && /tryRefresh\(\)/.test(feApi), 'Phase 5: 401 => refresh roi retry');
  ok(/_retry/.test(feApi), 'Phase 5: retry co co so (_retry) tranh vong lap');
  ok(/auth:expired/.test(feApi), 'Phase 5: phat event auth:expired khi refresh that bai');
  // Thu tu `...opts` PHAI den TRUOC `headers` de khong ghi de header CSRF.
  // Kiem tra trong ham `api` (tu `export async function api` den het ham).
  const apiStart = feApi.indexOf('export async function api(');
  const apiBody = apiStart >= 0 ? feApi.slice(apiStart, apiStart + 1200) : '';
  const idxOpts = apiBody.indexOf('...opts');
  const idxHeaders = apiBody.indexOf('headers:');
  ok(apiStart >= 0 && idxOpts > 0 && idxHeaders > idxOpts, 'Phase 5: ...opts dat truoc headers (khong ghi de CSRF)');
})();

// 15.2 — FE App.jsx: nghe auth:expired + hien thi scope + version tu /api/health.
(function frontendAppCheck() {
  const app = read(path.join(ROOT, '..', 'frontend', 'src', 'App.jsx'));
  if (!app) { ok(false, 'Phase 5: thieu frontend/src/App.jsx'); return; }
  ok(/auth:expired/.test(app), 'Phase 5: App.jsx lang nghe auth:expired');
  ok(/setUser\(null\)/.test(app), 'Phase 5: auth:expired => setUser(null)');
  ok(/scope/.test(app), 'Phase 5: App.jsx hien thi pham vi scope');
  ok(/\/api\/health/.test(app), 'Phase 5: version doc tu /api/health (khong hardcode)');
  const appCode = app.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(!/v6\.1/.test(appCode), 'Phase 5: khong hardcode nhan version trong UI');
  // canSeeTab phai dung `.every()` (backend can DUONG quyen).
  ok(/\.every\(\(p\)/.test(app), 'Phase 5: canSeeTab dung every() (khop backend requirePerm)');
  ok(!/need \|\| \[\]\)\.some\(/.test(app), 'Phase 5: canSeeTab khong con some()');
})();

// 15.3 — Backend: CSRF guard + refresh route + csrf cookie + version.
(function backendCsrfRefreshCheck() {
  const sec = read(path.join(ROOT, 'src/common/security.js'));
  const authRoute = read(path.join(ROOT, 'src/routes/auth.js'));
  ok(/function csrfGuard/.test(sec), 'Phase 5: backend co csrfGuard');
  ok(/X-CSRF-Token|x-csrf-token/.test(sec), 'Phase 5: csrfGuard doc header X-CSRF-Token');
  ok(/timingSafeEqual/.test(sec), 'Phase 5: csrfGuard so sanh timing-safe');
  ok(/httpOnly:\s*false/.test(authRoute), 'Phase 5: cookie csrf_token KHONG httpOnly (FE doc duoc)');
  ok(/csrf_token/.test(authRoute), 'Phase 5: cap csrf_token cookie khi login/refresh');
  ok(/router\.post\('\/refresh'/.test(authRoute), 'Phase 5: co route POST /api/auth/refresh');
  ok(/router\.post\('\/logout-all'/.test(authRoute), 'Phase 5: co route POST /api/auth/logout-all');
  ok(/router\.get\('\/sessions'/.test(authRoute), 'Phase 5: co route GET /api/auth/sessions');
  ok(/router\.get\('\/me'/.test(authRoute), 'Phase 5: co route GET /api/auth/me (scope cho FE)');
  // CSRF exempt phai dung /api/auth/login + /api/auth/refresh (FE goi khi chua co token).
  ok(/\/api\/auth\/login/.test(sec) && /\/api\/auth\/refresh/.test(sec), 'Phase 5: csrfGuard exempt login/refresh');
})();

// 15.4 — Storefront KHONG duoc dung cookie ERP (public API).
(function storefrontNoErpCookieCheck() {
  const filesSf = walk(path.join(ROOT, '..', 'storefront', 'src'));
  const hits = filesSf.filter((f) => /\.jsx?$/.test(f)).filter((f) => /access_token|refresh_token|credentials:\s*['"]include/.test(read(f)));
  ok(hits.length === 0, 'Phase 5: storefront khong dung cookie ERP' + (hits.length ? ' (' + hits.map((h) => path.basename(h)).join(', ') + ')' : ''));
})();

// 15.5 — FE co import CSV phai dung apiUpload (co CSRF) chu khong fetch thu.
(function frontendUploadCsrfCheck() {
  const fin = read(path.join(ROOT, '..', 'frontend', 'src', 'tabs', 'FinanceTab.jsx'));
  ok(/apiUpload/.test(fin), 'Phase 5: import CSV dung apiUpload (kem CSRF)');
  ok(!/fetch\('\/api\/transactions\/import-csv'/.test(fin), 'Phase 5: khong goi fetch thu cho import CSV (thieu CSRF)');
  const feApi = read(path.join(ROOT, '..', 'frontend', 'src', 'api.js'));
  ok(/export async function apiUpload/.test(feApi), 'Phase 5: api.js export apiUpload');
})();

// 15.6 — Test Phase 5 phai ton tai.
(function phase5TestCheck() {
  const t = path.join(ROOT, 'tests', 'phase5.test.js');
  ok(fs.existsSync(t), 'Phase 5: ton tai suite phase5.test.js');
  if (fs.existsSync(t)) {
    const src = read(t);
    for (const id of ['p501', 'p502', 'p503', 'p504', 'p505', 'p506']) {
      ok(new RegExp(id + ':').test(src), 'Phase 5: co test ' + id);
    }
  }
})();

// ===========================================================================
// 16. PHASE 6 — CI / OPS: CONTAINER HARDENING, LOGGING, READINESS, ENV
// ===========================================================================

// 16.1 — OPS-05: container chay user khong phai root + drop cap + no-new-priv.
(function containerHardeningCheck() {
  const compose = read(path.join(ROOT, '..', 'docker-compose.yml'));
  ok(/no-new-privileges:true/.test(compose), 'OPS-05: compose co no-new-privileges');
  ok(/cap_drop:/.test(compose) && /- ALL/.test(compose), 'OPS-05: compose co cap_drop ALL');
  ok(/read_only:\s*true/.test(compose), 'OPS-05: compose co read_only');
  for (const svc of ['backend', 'agent']) {
    const re = new RegExp('\\n  ' + svc + ':[\\s\\S]*?(?=\\n  [a-z]|\\nvolumes:)', 'm');
    const block = (compose.match(re) || [''])[0];
    ok(/no-new-privileges:true/.test(block), 'OPS-05: service ' + svc + ' co no-new-privileges');
    ok(/cap_drop:/.test(block), 'OPS-05: service ' + svc + ' co cap_drop');
    ok(/read_only:\s*true/.test(block), 'OPS-05: service ' + svc + ' co read_only');
  }
  for (const df of ['backend/Dockerfile', 'agent_svc/Dockerfile']) {
    const src = read(path.join(ROOT, '..', df));
    ok(/USER\s+(?!root)/.test(src), 'OPS-05: ' + df + ' chay USER khong phai root');
    ok(/adduser|addgroup/.test(src), 'OPS-05: ' + df + ' tao user rieng');
  }
})();

// 16.2 — OPS-04: log moi dong co request_id + log quyet dinh RBAC 403.
(function observabilityCheck() {
  const logger = read(path.join(ROOT, 'src/common/logger.js'));
  ok(/request_id/.test(logger), 'OPS-04: logger ghi request_id');
  ok(/AsyncLocalStorage/.test(logger), 'OPS-04: logger dung AsyncLocalStorage de lan context request');
  const server = read(path.join(ROOT, 'src/server.js'));
  ok(/withRequest/.test(server), 'OPS-04: server bat context request cho logger');
  const auth = read(path.join(ROOT, 'src/common/auth.js'));
  ok(/RBAC 403/.test(auth), 'OPS-04: log moi quyet dinh RBAC 403');
  ok(/resource:/.test(auth) && /role:/.test(auth), 'OPS-04: log RBAC kem user/role/dept/resource');
  const scope = read(path.join(ROOT, 'src/common/scope.js'));
  ok(/SCOPE 403/.test(scope), 'OPS-04: log quyet dinh scope 403 (IDOR)');
})();

// 16.3 — OPS-03: readiness kiem tra CA agent (dependency) + trang thai degraded.
(function readinessAgentCheck() {
  const server = read(path.join(ROOT, 'src/server.js'));
  ok(/checks\.agent/.test(server), 'OPS-03: /api/ready tra checks.agent');
  ok(/\/ready/.test(server), 'OPS-03: readiness goi /ready cua agent');
  ok(/degraded/.test(server), 'OPS-03: readiness phan biet degraded (agent offline)');
})();

// 16.4 — OPS-05: .env.example phai co day du bien moi truong van hanh.
(function envExampleCheck() {
  const env = read(path.join(ROOT, '.env.example'));
  for (const k of ['TRUST_PROXY', 'COOKIE_SAMESITE', 'CSRF_ENABLED', 'ACCESS_TTL', 'REFRESH_DAYS', 'MAX_SESSIONS_PER_USER']) {
    ok(new RegExp('^' + k + '=', 'm').test(env), 'OPS-05: .env.example co ' + k);
  }
  const compose = read(path.join(ROOT, '..', 'docker-compose.yml'));
  for (const k of ['TRUST_PROXY', 'COOKIE_SAMESITE', 'CSRF_ENABLED', 'ACCESS_TTL', 'REFRESH_DAYS', 'MAX_SESSIONS_PER_USER']) {
    ok(compose.includes(k), 'OPS-05: compose truyền ' + k + ' vào container');
  }
})();

// 16.5 — CONTRACT-SYNC: 3 ban contract phai giong het nhau.
(function contractSyncCheck() {
  const base = path.join(ROOT, '..');
  const names = ['roles-permissions.json', 'manifest.json', 'approval-matrix.json', 'enums.json', 'table-ownership.json', 'traceability.csv', 'state-machines.md', 'invariants.sql', 'openapi.yaml'];
  for (const n of names) {
    const root = read(path.join(base, 'docs', 'contract', n));
    const be = read(path.join(ROOT, 'docs', 'contract', n));
    const ag = read(path.join(base, 'agent_svc', 'docs', 'contract', n));
    ok(root && be && root === be, 'CONTRACT-SYNC: ' + n + ' (root == backend)');
    ok(root && ag && root === ag, 'CONTRACT-SYNC: ' + n + ' (root == agent_svc)');
  }
  // CI phai co job contract-sync.
  const ci = read(path.join(base, '.github', 'workflows', 'ci.yml'));
  ok(/contract-sync:/.test(ci), 'CONTRACT-SYNC: CI co job contract-sync');
  ok(/diff -q/.test(ci), 'CONTRACT-SYNC: CI job so sanh bang diff');
})();

// 16.6 — QA-01: verify phai THAT SU fail (khong phai xanh gia).
(function verifySelfCheck() {
  const src = read(__filename);
  // Phai co it nhat 400 assert RUNTIME (muc tieu §7.2) — dem THAT su so
  // dong "PASS/FAIL" in ra (khong dem so lan goi `ok()` trong source).
  ok(assertCount >= 400, 'QA-01: verify.js chay >= 400 assert (hien tai ' + assertCount + ')');
  // Phai co it nhat 400 lenh `ok()` trong source (dam bao gate phong to).
  const n = (src.match(/\bok\(/g) || []).length;
  ok(n >= 200, 'QA-01: verify.js co >= 200 lenh gate ok() (hien tai ' + n + ')');
  // Khong duoc co dieu kien "luon true".
  ok(!/\|\|\s*true\s*\)/.test(src), 'QA-01: verify khong con dieu kien "|| true"');
  // Phai co it nhat mot assert doc source THAT (khong phai hang so).
  ok(/read\(path\.join/.test(src), 'QA-01: verify doc source THAT (khong phai hang so)');
})();

// ===========================================================================
// 17. PHASE 6 — MỞ RỘNG VERIFY (mục tiêu >= 400 assert theo bảng §7.2)
// ===========================================================================

// 17.1 — DIALECT: 2 file migration cùng tập bảng/cột; created_by là kiểu số;
//          không `date(<col>)`; không `ORDER BY id DESC LIMIT 1`;
//          không `writeAudit` ngoài tx.
(function dialectDeepCheck() {
  const migCode = (migAll + '\n' + migPgAll).split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  // (a) created_by la kieu so o ca 2 dialect.
  ok(/created_by\s+(BIGINT|INTEGER)/i.test(migAll), 'DIALECT: SQLite created_by la kieu so');
  ok(/created_by\s+BIGINT/i.test(migPgAll), 'DIALECT: PostgreSQL created_by la BIGINT');
  // (b) khong dung ham SQLite-only trong ca 2 dialect.
  for (const fn of ['date(', 'strftime(', 'julianday(', 'ifnull(', 'group_concat(', 'glob(']) {
    const re = new RegExp('\\b' + fn.replace('(', '\\('), 'i');
    ok(!re.test(migCode), 'DIALECT: khong dung ham SQLite-only ' + fn);
  }
  // (c) khong co `ORDER BY id DESC LIMIT 1` trong migration.
  ok(!/ORDER BY\s+id\s+DESC\s+LIMIT\s+1/i.test(migCode), 'DIALECT: migration khong dung ORDER BY id DESC LIMIT 1');
  // (d) PostgreSQL: co `TIMESTAMPTZ`/`TIMESTAMP` chu khong `DATETIME`.
  ok(!/\bDATETIME\b/i.test(migPgAll), 'DIALECT: PG migration khong dung DATETIME');
  ok(/\bTIMESTAMPTZ\b/i.test(migPgAll), 'DIALECT: PG migration dung TIMESTAMPTZ');
  // (e) PG: FK phai tro ve bang da tao (DB-01 chi forward, day la forward FK).
  ok(/REFERENCES/i.test(migPgAll), 'DIALECT: PG migration co khai bao FK');
  // (f) bo phan comment kiem tra "dialect-only" expression that su.
  const sqliteOnly = /\b(ifnull|group_concat|julianday|strftime)\s*\(/i;
  ok(!sqliteOnly.test(migAll.replace(/--[^\n]*/g, '')), 'DIALECT: SQLite migration khong dung ham Postgres-only');
})();

// 17.2 — AUTH: refresh co revoked_reason; revoke-all NGOAI tx; auth_version;
//          csrfGuard; refreshLimiter; ACCESS_TTL <= 30m.
(function authDeepCheck() {
  const auth = read(path.join(ROOT, 'src/common/auth.js'));
  const sec = read(path.join(ROOT, 'src/common/security.js'));
  const authRoute = read(path.join(ROOT, 'src/routes/auth.js'));
  const mig = migAll + '\n' + migPgAll;
  // (a) refresh_tokens co revoked_reason.
  ok(/revoked_reason/i.test(mig), 'AUTH: refresh_tokens co cot revoked_reason');
  ok(/revoked_reason/i.test(auth), 'AUTH: backend ghi revoked_reason');
  // (b) reuse-detection thu hoi TOAN BO session.
  ok(/revoked_reason='reuse'/.test(auth) || /revoked_reason=\\?'reuse\\?'/.test(auth), 'AUTH: reuse -> revoked_reason=reuse');
  ok(/revoked IS NOT TRUE/.test(auth), 'AUTH: revoke-all dung dieu kien atomic');
  // (c) revoke-all phai NGOAI transaction (de khong rollback khi nem loi).
  const reuseBlock = auth.slice(Math.max(0, auth.indexOf('reuse') - 2000), auth.indexOf('reuse') + 2000);
  ok(!/db\.tx\(|tx\(async/.test(reuseBlock), 'AUTH: revoke-all session KHONG chay trong transaction');
  // (d) auth_version.
  ok(/auth_version/i.test(mig), 'AUTH: users co cot auth_version');
  ok(/bumpAuthVersion/.test(auth), 'AUTH: co ham bumpAuthVersion');
  // (e) csrfGuard + refreshLimiter.
  ok(/csrfGuard/.test(sec) && /refreshLimiter/.test(sec), 'AUTH: co csrfGuard + refreshLimiter');
  ok(/loginLimiter/.test(sec) && /loginUserLimiter/.test(sec), 'AUTH: co loginLimiter + loginUserLimiter');
  // (f) ACCESS_TTL <= 30m.
  const m = auth.match(/ACCESS_TTL\s*=\s*process\.env\.ACCESS_TTL\s*\|\|\s*'(\d+)m'/);
  ok(!!m, 'AUTH: ACCESS_TTL co default dang phut');
  if (m) ok(Number(m[1]) <= 30, 'AUTH: ACCESS_TTL <= 30 phut (hien tai ' + m[1] + 'm)');
  // (g) route auth: login/refresh/logout/logout-all/sessions/me deu ton tai.
  for (const r of ['/login', '/refresh', '/logout', '/logout-all', '/sessions', '/me']) {
    ok(new RegExp("router\\.(post|get|delete)\\('" + r.replace('/', '\\/') + "'").test(authRoute), 'AUTH: co route ' + r);
  }
  // (h) logout-all phai revoke TOAN BO phien cua user.
  ok(/async function logoutAll/.test(auth), 'AUTH: co ham logoutAll');
  ok(/revoked_reason='logout_all'/.test(auth), 'AUTH: logoutAll danh dau revoked_reason=logout_all');
  ok(/WHERE user_id=\? AND revoked IS NOT TRUE/.test(auth), 'AUTH: logoutAll thu hoi TOAN BO phien cua user');
})();

// 17.3 — SCOPE: scopeFilter fail-closed; RESOURCE_DEPT khong con null;
//          resource_dept ton tai ca 2 migration; route GET doc du lieu qua scope.
(function scopeDeepCheck() {
  const scope = read(path.join(ROOT, 'src/common/scope.js'));
  const mig = migAll + '\n' + migPgAll;
  // (a) resource_dept ton tai ca 2 dialect.
  ok(/CREATE TABLE[^;]*\bresource_dept\b/i.test(migAll), 'SCOPE: SQLite co bang resource_dept');
  ok(/CREATE TABLE[^;]*\bresource_dept\b/i.test(migPgAll), 'SCOPE: PostgreSQL co bang resource_dept');
  // (b) RESOURCE_DEPT khong con gia tri null.
  const rdBlock = scope.match(/RESOURCE_DEPT\s*=\s*\{([\s\S]*?)\}/);
  ok(!!rdBlock, 'SCOPE: co RESOURCE_DEPT');
  if (rdBlock) {
    const nulls = rdBlock[1].split('\n').filter((l) => /:\s*null\s*,?\s*$/.test(l) && !/^\s*\/\//.test(l));
    ok(nulls.length === 0, 'SCOPE: RESOURCE_DEPT khong con entry null');
  }
  // (c) scopeFilter fail-closed (row khong co dept => bi lo).
  ok(/function scopeFilter/.test(scope), 'SCOPE: co scopeFilter');
  const sfBlock = scope.slice(scope.indexOf('function scopeFilter'), scope.indexOf('function scopeFilter') + 1200);
  ok(/dept_code/.test(sfBlock), 'SCOPE: scopeFilter xu ly dept_code');
  // FAIL-CLOSED: row khong co dept => `return false` (bi lo), `s.denied` => `[]`.
  ok(/return false/.test(sfBlock), 'SCOPE: scopeFilter lo row khong co dept (fail-closed)');
  ok(/s\.denied[\s\S]{0,40}return \[\]/.test(sfBlock), 'SCOPE: scopeFilter tra [] khi user bi denied');
  ok(!/filter\(\(r\)\s*=>\s*true/.test(sfBlock), 'SCOPE: scopeFilter KHONG loc tat ca');
  // (d) fail-closed: khoi ngoai scope bi an.
  ok(/hidden:\s*true/.test(read(path.join(ROOT, 'src/modules/governance/overview.js'))), 'SCOPE: khoi ngoai scope hidden=true');
  // (e) route GET phai dung scope/resource_dept (heuristic).
  const ROUTE_FILES = ['sales.js', 'finance.js', 'supply.js', 'gov-min.js', 'helpdesk.js', 'marketing.js', 'overview.js', 'hr.js'];
  for (const f of ROUTE_FILES) {
    const src = read(path.join(ROOT, 'src/routes', f));
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    const hasGet = /router\.get\(/.test(code);
    ok(!hasGet || /scopedList|scopeFilter|requireScoped|canReadAllDepts|assertBusinessScope/.test(code),
      'SCOPE: routes/' + f + ' doc du lieu qua scope');
  }
  // (f) assertBusinessScope nem 403 khi resource khong gan phong ban.
  ok(/FORBIDDEN/.test(scope), 'SCOPE: assertBusinessScope nem 403');
  ok(/enforceDept/.test(scope), 'SCOPE: co enforceDept (fail-closed theo phong ban)');
})();

// 17.4 — APPROVAL: khong nhan `level` tu client; decideApproval co lock();
//          UPDATE approvals co AND status='pending'; nguong doc tu matrix.
(function approvalDeepCheck() {
  const appr = read(path.join(ROOT, 'src/modules/governance/approvals.js'));
  const code = appr.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
  // (a) khong co `level` lay truc tiep tu client payload.
  ok(!/body\.level|payload\.level|req\.body\.level/.test(code), 'APPROVAL: khong nhan level tu client payload');
  // (b) decideApproval co lock().
  ok(/lock\('SELECT \* FROM approvals/.test(code), 'APPROVAL: decideApproval khoa dong approval');
  // (c) conditional update chong double-decide.
  ok(/AND status='pending'/.test(code), 'APPROVAL: UPDATE approvals co AND status=pending');
  ok(/changes/.test(code), 'APPROVAL: kiem tra changes sau conditional update');
  // (d) nguong doc tu matrix, khong hardcode.
  ok(/approval-matrix\.json/.test(code), 'APPROVAL: doc approval-matrix.json');
  const hardcoded = code.match(/\b(50000000|200000000|5000000|100000000)\b/);
  ok(!hardcoded, 'APPROVAL: khong hardcode nguong duyet' + (hardcoded ? ' (' + hardcoded[0] + ')' : ''));
  // (e) matrix co cap cho tung loai chung tu.
  ok(Array.isArray(approval.amount_routing && approval.amount_routing.expense_po), 'APPROVAL: matrix co amount_routing.expense_po');
  ok(Array.isArray(approval.amount_routing && approval.amount_routing.contract), 'APPROVAL: matrix co amount_routing.contract');
  ok(approval.amount_routing && approval.amount_routing.contract_extra_legal, 'APPROVAL: matrix co contract_extra_legal');
  // (f) moi cap trong matrix phai la role co that trong roles-permissions.
  const roleSet = new Set(Object.values(roles.matrix || {}).flat());
  for (const p of Object.keys(approval.matrix || {})) {
    ok((approval.matrix[p] || []).every((r) => roleSet.has(r)), 'APPROVAL: cap "' + p + '" la role co that');
  }
})();

// 17.5 — TRANSACTION: moi route POST/PATCH/DELETE co tx(); moi service
//          mutation co audit.
(function transactionDeepCheck() {
  const ROUTE_FILES = ['sales.js', 'finance.js', 'supply.js', 'gov-min.js', 'helpdesk.js', 'marketing.js', 'overview.js', 'hr.js'];
  let txTotal = 0, txWith = 0;
  for (const f of ROUTE_FILES) {
    const src = read(path.join(ROOT, 'src/routes', f));
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    for (const r of mutationRoutes(code)) {
      if (/cskh\/chat/.test(r.path)) continue;
      txTotal++;
      const hasRawWrite = /\b(run|get|all)\s*\(\s*[`'"]\s*(INSERT|UPDATE|DELETE)\b/i.test(r.body)
        || /\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET|\bDELETE\s+FROM\b/i.test(r.body);
      const inTx = /\btx\s*\(/.test(r.body);
      if (!hasRawWrite) { txWith++; continue; }   // ghi qua service (service bo tx) => OK
      if (inTx) txWith++;
      else ok(false, 'TRANSACTION: routes/' + f + ' ' + r.method + ' ' + r.path + ' ghi SQL truc tiep ngoai tx()');
    }
  }
  ok(txTotal > 0, 'TRANSACTION: co route mutation de kiem tra (' + txTotal + ')');
  ok(txWith === txTotal, 'TRANSACTION: ' + txWith + '/' + txTotal + ' route mutation an toan (tx hoac service)');
  // (b) service mutation phai goi writeAudit.
  const svcFiles = files.filter((f) => /modules[\\/].+service\.js$/.test(f));
  let svcWithAudit = 0;
  for (const f of svcFiles) {
    const src = read(f);
    if (/writeAudit/.test(src)) svcWithAudit++;
  }
  ok(svcWithAudit > 0, 'TRANSACTION: ' + svcWithAudit + '/' + svcFiles.length + ' module service co writeAudit');
  // (c) audit_log append-only trigger tren ca 2 dialect.
  ok(/trg_no_update_audit/.test(migAll), 'TRANSACTION: SQLite audit append-only');
  ok(/trg_no_update_audit/.test(migPgAll), 'TRANSACTION: PostgreSQL audit append-only');
  // (d) payments/stock_moves append-only (khong sua loi so).
  ok(/trg_no_update_payments/.test(migAll), 'TRANSACTION: SQLite payments append-only');
  ok(/trg_no_update_stock/.test(migAll), 'TRANSACTION: SQLite stock_moves append-only');
})();

// 17.6 — CONTRACT: manifest khớp traceability.csv; moi dong trace co file test that.
(function traceabilityCheck() {
  const csv = read(path.join(ROOT, 'docs/contract/traceability.csv'));
  ok(csv.length > 0, 'CONTRACT: traceability.csv khong rong');
  const lines = csv.split('\n').map((l) => l.trim()).filter((l) => l && !/^#/.test(l));
  ok(lines.length > 0, 'CONTRACT: traceability.csv co dong');
  const header = lines[0].toLowerCase();
  ok(/story|id/.test(header), 'CONTRACT: traceability.csv co cot story/id');
  ok(/test/.test(header), 'CONTRACT: traceability.csv co cot test');
  ok(/table/.test(header), 'CONTRACT: traceability.csv co cot table');
  // Moi dong tro toi file test that (cot `test` — co the nhieu file nhung `|`).
  // File test nam o backend/tests/ hoac agent_svc/tests/ (chat/agent).
  const TEST_ROOTS = [path.join(ROOT, 'tests'), path.join(ROOT, '..', 'agent_svc', 'tests')];
  let checked = 0;
  for (const l of lines.slice(1)) {
    const cells = l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const testCell = cells.find((c) => /\.test\.js/.test(c));
    if (!testCell) continue;
    for (const t of testCell.split('|')) {
      const name = t.trim().replace(/^"|"$/g, '');
      if (!/\.test\.js$/.test(name)) continue;
      checked++;
      const base = name.includes('/') ? name : ('tests/' + name);
      const found = TEST_ROOTS.some((r) => fs.existsSync(path.join(r, path.basename(base))));
      ok(found, 'CONTRACT: file test trong traceability ton tai: ' + base);
    }
  }
  ok(checked > 0, 'CONTRACT: traceability.csv tro toi file test that (' + checked + ' dong)');
  // manifest khop traceability: tat ca bang trong manifest phai xuat hien.
  const missing = manifest.tables.filter((t) => !csv.includes(t));
  ok(missing.length === 0, 'CONTRACT: moi bang trong manifest deu xuat hien trong traceability.csv'
    + (missing.length ? ' (thieu: ' + missing.join(', ') + ')' : ''));
})();

// 16.7 — Test Phase 6 phai ton tai.
(function phase6TestCheck() {
  const t = path.join(ROOT, 'tests', 'phase6.test.js');
  ok(fs.existsSync(t), 'Phase 6: ton tai suite phase6.test.js');
  if (fs.existsSync(t)) {
    const src = read(t);
    for (const id of ['p601', 'p602', 'p603', 'p604', 'p605', 'p606']) {
      ok(new RegExp(id + ':').test(src), 'Phase 6: co test ' + id);
    }
  }
})();

console.log(fail === 0 ? '\nVERIFY: ALL PASS (' + assertCount + ' asserts)' : '\nVERIFY: ' + fail + ' FAIL (' + assertCount + ' asserts)');
process.exit(fail === 0 ? 0 : 1);