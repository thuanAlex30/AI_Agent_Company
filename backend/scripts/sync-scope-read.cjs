// Script doi bo (idempotent): them `scope_read` vao role_scopes va dong bo 3 ban
// roles-permissions.json (backend/docs, docs/, agent_svc/docs).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [
  path.join(ROOT, 'backend', 'docs', 'contract', 'roles-permissions.json'),
  path.join(ROOT, 'docs', 'contract', 'roles-permissions.json'),
  path.join(ROOT, 'agent_svc', 'docs', 'contract', 'roles-permissions.json'),
];

// scope_read: 'all' | 'dept' | 'own' | 'none'
const SCOPE_READ = {
  owner: 'all',
  ceo: 'all',
  coo: 'all',
  director: 'dept',
  manager: 'dept',
  leader: 'dept',
  staff: 'own',
  // HR phai thay TOAN CONG TY (chinh sach nhan su) — chi doc, khong ghi tai chinh.
  hr: 'all',
  cfo: 'dept',
  accountant: 'dept',
  legal: 'dept',
  sales: 'dept',
  marketing: 'dept',
  cskh: 'dept',
  warehouse: 'dept',
};

for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log('SKIP (khong ton tai):', f); continue; }
  const raw = fs.readFileSync(f, 'utf8');
  const j = JSON.parse(raw);
  const rs = j.role_scopes || (j.role_scopes = {});
  for (const [role, sr] of Object.entries(SCOPE_READ)) {
    if (!rs[role]) continue;
    rs[role].scope_read = sr;
  }
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('OK:', path.relative(ROOT, f));
}
