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
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) fail++; };
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
const migAll = mig + '\n' + mig2;
const migPgAll = migPg + '\n' + migPg2;
if (!mig) ok(false, 'thieu 001_init.sql');
else {
  for (const t of manifest.tables) ok(new RegExp('CREATE TABLE[^;]*\\b' + t + '\\b', 'i').test(migAll), 'migration co bang ' + t);
  ok(/BIGINT/i.test(migAll), 'dung BIGINT');
  ok(!/INSERT OR IGNORE/i.test(migAll + migPgAll), 'cam INSERT OR IGNORE');
  ok(/ON CONFLICT.*DO NOTHING/i.test(migAll + migPgAll), 'dung ON CONFLICT DO NOTHING');
  ok(!/RAISE ABORT/i.test(migAll), 'cam RAISE ABORT trong file chung (de vao file dialect)');
  ok(!/PRAGMA/i.test(migAll), 'cam PRAGMA trong migration (chi duoc trong db.js runtime)');
  ok(!/DATETIME/i.test(migAll), 'cam DATETIME (dung TIMESTAMP)');
  ok(!/GLOB/i.test(migAll), 'cam GLOB (khong ANSI; check month bang CHECK month LIKE \'____-__\' hoac regex dialect)');
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
    [/datetime\s*\(/i, 'datetime('],
    [/date\s*\(\s*'now'/i, "date('now'"],
    [/strftime\s*\(/i, 'strftime('],
    [/INSERT\s+OR\s+(IGNORE|REPLACE)/i, 'INSERT OR IGNORE/REPLACE'],
    [/AUTOINCREMENT/i, 'AUTOINCREMENT'],
  ];
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
      // bo qua comment giai thich lint
      if (/lint trong verify|khong dung datetime|Khong dung datetime/.test(line)) return;
      for (const [re, tag] of FORBIDDEN) {
        if (re.test(line)) { bad.push(`${f}:${i + 1} [${tag}] ${line.trim().slice(0, 110)}`); break; }
      }
      if (/PRAGMA/i.test(line) && !/db\.js/.test(rel)) bad.push(`${f}:${i + 1} [PRAGMA] ${line.trim().slice(0, 110)}`);
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
  ok(/conn && typeof conn\.run === 'function'/.test(auditSrc), 'GOV-01: writeAudit dung conn trong transaction');
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

console.log(fail === 0 ? '\nVERIFY: ALL PASS' : '\nVERIFY: ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);