// Script doi bo (idempotent): them mapping `resource_dept` vao table-ownership.json
// va dong bo 3 ban (backend/docs, docs/, agent_svc/docs).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FILES = [
  path.join(ROOT, 'backend', 'docs', 'contract', 'table-ownership.json'),
  path.join(ROOT, 'docs', 'contract', 'table-ownership.json'),
  path.join(ROOT, 'agent_svc', 'docs', 'contract', 'table-ownership.json'),
];

// Bang nghiep vu -> phong ban so huu (Phase 3 §4.2).
// `null` = cot dept_code that (khong can resource_dept).
const RESOURCE_DEPT = {
  orders: 'employee_id -> employees.dept_code, fallback sales',
  order_items: 'theo orders',
  customers: 'owner_employee_id -> employees.dept_code, fallback sales',
  leads: 'owner_employee_id -> employees.dept_code, fallback sales',
  quotes: 'theo customers, fallback sales',
  contracts: 'theo customers, fallback sales',
  shipments: 'theo orders, fallback supply',
  tickets: 'theo customers, fallback cskh',
  debts: 'theo orders, fallback finance',
  payments: 'theo debts, fallback finance',
  stock_moves: 'supply',
  purchase_orders: 'supply',
  suppliers: 'supply',
  transactions: 'finance',
  expenses: 'finance',
  reminder_log: 'finance',
  approvals: 'theo ref_type/ref_id, fallback ceo',
  campaigns: 'marketing',
  qa_checks: 'qa',
  risks: 'legal',
  it_incidents: 'it',
  product_features: 'product',
  ratings: 'theo customers, fallback cskh',
  sop_tasks: 'cot dept_code that (scopeFilter)',
  budgets: 'cot dept_code that (scopeFilter)',
};

for (const f of FILES) {
  if (!fs.existsSync(f)) { console.log('SKIP:', f); continue; }
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.resource_dept = {
    table: 'resource_dept',
    columns: ['table_name', 'record_id', 'dept_code', 'owner_employee_id', 'updated_at'],
    note: 'Bang danh muc khoa phong ban cho resource nghiep vu. Ghi TRONG cung transaction voi du lieu (INV-2). Doc thi assertBusinessScope / scopedList — FAIL-CLOSED.',
    mapping: RESOURCE_DEPT,
  };
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n', 'utf8');
  console.log('OK:', path.relative(ROOT, f));
}
