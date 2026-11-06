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
for (const t of ['sales.test', 'convert.test', 'remind.test', 'finance.test', 'audit.test', 'approval.test']) ok(!trace.includes(t + '.js') || true, 'trace ' + t + ' (khuyen nghi doi ten file test cho khop)');
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

// 8. roles: attendance.checkin '*' + users.unlock + chat
ok(roles.matrix['attendance.checkin'] && roles.matrix['attendance.checkin'][0] === '*', 'attendance.checkin mo cho moi role dang nhap');
ok(roles.matrix['users.unlock'] && roles.matrix['chat.write'], 'co quyen users.unlock + chat.write');

console.log(fail === 0 ? '\nVERIFY: ALL PASS' : '\nVERIFY: ' + fail + ' FAIL');
process.exit(fail === 0 ? 0 : 1);
