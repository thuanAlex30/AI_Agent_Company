// Script doi bo (idempotent): them `amount_routing.contract` vao approval-matrix.json
// va dong bo 3 ban (backend/docs, docs/, agent_svc/docs).
//
// P1-6 / INV-6: 1 NGUON SUY NHAT cho cap duyet — khong hardcode trong code.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [
  path.join(ROOT, 'backend', 'docs', 'contract', 'approval-matrix.json'),
  path.join(ROOT, 'docs', 'contract', 'approval-matrix.json'),
  path.join(ROOT, 'agent_svc', 'docs', 'contract', 'approval-matrix.json'),
];

for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log('SKIP:', f); continue; }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const ar = j.amount_routing || (j.amount_routing = {});
  if (!Array.isArray(ar.contract)) {
    ar.contract = [
      { level: 'manager', lt: 50000000 },
      { level: 'ceo', gte: 50000000 },
    ];
  }
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('OK:', path.relative(ROOT, f));
}
