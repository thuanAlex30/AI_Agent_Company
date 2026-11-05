-- 001_init.sql (SQLite) — BizOps AI v6.1
-- Nguon duy nhat: docs/contract/manifest.json + enums.json + state-machines.md v6.1
-- Tien BIGINT (dong), thoi gian TIMESTAMP UTC, upsert ON CONFLICT DO NOTHING (vi du xem migrate.js)
-- normalize tieng Viet: NFD + map d/D (ham mau trong comment cuoi file)

-- 01 departments
CREATE TABLE IF NOT EXISTS departments (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  head_employee_id INTEGER NULL,
  budget_month BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (code IN ('ceo','sales','marketing','cskh','ops','supply','finance','hr','it','legal','qa','product'))
);

-- 02 users (module auth so huu; hr KHONG write)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_code TEXT UNIQUE NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','ceo','coo','cfo','director','manager','leader','legal','hr','accountant','warehouse','sales','cskh','staff')),
  failed_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 03 refresh_tokens (auth so huu)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 04 employees
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  dept_code TEXT NOT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  manager_id BIGINT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  phone TEXT NULL,
  salary_base BIGINT DEFAULT 0 CHECK (salary_base >= 0),
  left_date DATE NULL,
  status TEXT NOT NULL CHECK (status IN ('active','probation','off')),
  hired_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(dept_code);

-- 05 attendance
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  work_date DATE NOT NULL,
  check_in TIME NULL,
  check_out TIME NULL,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent','leave')),
  UNIQUE (employee_id, work_date)
);

-- 06 recruitments
CREATE TABLE IF NOT EXISTS recruitments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position TEXT NOT NULL,
  dept_code TEXT NOT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  status TEXT NOT NULL CHECK (status IN ('open','closed','cancelled')),
  opened_date DATE NULL,
  closed_date DATE NULL,
  cost BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 07 trainings
CREATE TABLE IF NOT EXISTS trainings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  topic TEXT NOT NULL,
  hours REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','done')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 08 customers
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  address TEXT NULL,
  type TEXT NOT NULL DEFAULT 'retail' CHECK (type IN ('retail','wholesale','enterprise')),
  owner_employee_id BIGINT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- 09 leads
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  source TEXT NULL,
  campaign_id BIGINT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','mql','sql','quoted','negotiating','won','lost')),
  owner_employee_id BIGINT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  amount_expected BIGINT DEFAULT 0,
  last_touch DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);

-- 10 quotes
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  lead_id BIGINT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  valid_until DATE NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11 contracts
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  quote_id BIGINT NULL REFERENCES quotes(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','legal_review','approved','signed','rejected','terminated')),
  signed_date DATE NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12 campaigns (CAM cot dem tinh)
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('facebook','tiktok','zalo','shopee','offline','seo')),
  cost BIGINT DEFAULT 0,
  start_date DATE NULL,
  end_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13 orders
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  contract_id BIGINT NULL REFERENCES contracts(id) ON DELETE RESTRICT,
  employee_id BIGINT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','pending','approved','in_progress','done','paid','partial','cancelled','refunded')),
  order_date DATE NOT NULL,
  idempotency_key TEXT UNIQUE NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 14 order_items
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  price BIGINT NOT NULL,
  cost BIGINT NOT NULL
);

-- 15 products
CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price BIGINT NOT NULL,
  cost BIGINT NOT NULL,
  unit TEXT DEFAULT 'cái',
  stock_alert INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16 stock_moves (append-only, CHECK dau)
CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('in','out','adjust')),
  qty BIGINT NOT NULL,
  ref_code TEXT NULL,
  idempotency_key TEXT UNIQUE NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK ((type = 'in' AND qty > 0) OR (type = 'out' AND qty < 0) OR (type = 'adjust' AND qty <> 0))
);
CREATE TRIGGER IF NOT EXISTS trg_no_update_stock BEFORE UPDATE ON stock_moves BEGIN SELECT RAISE(ABORT,'stock_moves append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_stock BEFORE DELETE ON stock_moves BEGIN SELECT RAISE(ABORT,'stock_moves append-only'); END;

-- 17 purchase_orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  supplier_id BIGINT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','sent','received','cancelled','rejected')),
  need_date DATE NULL,
  idempotency_key TEXT UNIQUE NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18 suppliers (CAM cot debt tinh)
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NULL,
  rating INTEGER DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 19 shipments
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  carrier TEXT NULL,
  tracking_code TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shipping','done','failed','cancelled')),
  ship_fee BIGINT DEFAULT 0,
  attempt INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);

-- 20 qa_checks
CREATE TABLE IF NOT EXISTS qa_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('order','shipment','product')),
  ref_id BIGINT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','fail')),
  defect TEXT NULL,
  repeat_of BIGINT NULL,
  checker BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 21 sop_tasks
CREATE TABLE IF NOT EXISTS sop_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dept_code TEXT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  owner BIGINT NULL,
  due_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','overdue')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 22 transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trans_date DATE NOT NULL,
  amount BIGINT NOT NULL,
  content TEXT NULL,
  bank_ref TEXT UNIQUE NOT NULL,
  matched_order_id BIGINT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('matched','unmatched')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 23 debts
CREATE TABLE IF NOT EXISTS debts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_id BIGINT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('receivable','payable')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  paid BIGINT DEFAULT 0,
  due_date DATE NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','overdue','cancelled')),
  note TEXT NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (paid >= 0 AND paid <= amount),
  CHECK ((type = 'receivable' AND customer_id IS NOT NULL) OR type = 'payable')
);
CREATE INDEX IF NOT EXISTS idx_debts_status_due ON debts(status, due_date);

-- 24 payments (append-only, service cong don — khong trigger rollup)
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id BIGINT NULL REFERENCES debts(id) ON DELETE RESTRICT,
  expense_id BIGINT NULL REFERENCES expenses(id) ON DELETE RESTRICT,
  order_id BIGINT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL CHECK (amount <> 0),
  method TEXT NOT NULL CHECK (method IN ('cash','bank','ewallet')),
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actor TEXT NULL,
  note TEXT NULL,
  idempotency_key TEXT UNIQUE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK ((CASE WHEN debt_id IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN expense_id IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
CREATE TRIGGER IF NOT EXISTS trg_no_update_payments BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT,'payments append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_payments BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT,'payments append-only'); END;

-- 25 expenses
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('payable','fee','salary','marketing','other')),
  supplier_id BIGINT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount BIGINT NOT NULL,
  paid BIGINT DEFAULT 0 CHECK (paid >= 0),
  due_date DATE NULL,
  note TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 26 budgets
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dept_code TEXT NOT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  month TEXT NOT NULL CHECK (month LIKE '____-__'),
  planned BIGINT NOT NULL,
  actual BIGINT DEFAULT 0,
  UNIQUE (dept_code, month)
);

-- 27 approvals
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL CHECK (ref_type IN ('contract','purchase_order','expense','leave','discount')),
  ref_id BIGINT NOT NULL,
  requester BIGINT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('leader','manager','director','cfo','ceo','board','legal')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by BIGINT NULL,
  decided_at TIMESTAMP NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 28 audit_log (append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  old_json TEXT NULL,
  new_json TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS trg_no_update_audit BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'audit append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_no_delete_audit BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT,'audit append-only'); END;
CREATE INDEX IF NOT EXISTS idx_audit_table_record ON audit_log(table_name, record_id);

-- 29 risks
CREATE TABLE IF NOT EXISTS risks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('low','medium','high','critical')),
  owner BIGINT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigating','closed')),
  due_date DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 30 reminder_log (enforce 1 tin/ngay/khoan)
CREATE TABLE IF NOT EXISTS reminder_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debt_id BIGINT NOT NULL REFERENCES debts(id) ON DELETE RESTRICT,
  sent_date DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'inapp',
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (debt_id, sent_date)
);

-- 31 messages
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  debt_id BIGINT NULL REFERENCES debts(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  content TEXT NOT NULL,
  channel TEXT DEFAULT 'web',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 32 tickets
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  category TEXT NOT NULL DEFAULT 'easy' CHECK (category IN ('easy','technical','legal','complaint','policy_inquiry')),
  subject TEXT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','processing','resolved','closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assignee BIGINT NULL,
  sla_due TIMESTAMP NULL,
  first_response_at TIMESTAMP NULL,
  resolved_at TIMESTAMP NULL,
  reopen_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_sla ON tickets(sla_due);

-- 33 ratings (stars NOT NULL — cam rating nhap)
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_id BIGINT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  ticket_id BIGINT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 34 it_incidents
CREATE TABLE IF NOT EXISTS it_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'p3' CHECK (severity IN ('p1','p2','p3','p4')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fixing','resolved','closed')),
  assignee BIGINT NULL,
  mttr_min INTEGER NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 35 product_features
CREATE TABLE IF NOT EXISTS product_features (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea','spec','building','testing','released')),
  owner BIGINT NULL,
  adoption REAL NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- schema_migrations (verify loai tru khi dem)
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- VIEWS
CREATE VIEW IF NOT EXISTS v_stock_onhand AS SELECT product_sku AS sku, SUM(qty) AS stock FROM stock_moves GROUP BY product_sku;
CREATE VIEW IF NOT EXISTS v_campaign_roi AS SELECT c.id AS campaign_id, c.name, c.cost, COUNT(l.id) AS leads, SUM(CASE WHEN l.stage IN ('mql','sql','quoted','negotiating','won') THEN 1 ELSE 0 END) AS mql, SUM(CASE WHEN l.stage IN ('sql','quoted','negotiating','won') THEN 1 ELSE 0 END) AS sql, SUM(CASE WHEN l.stage = 'won' THEN 1 ELSE 0 END) AS orders FROM campaigns c LEFT JOIN leads l ON l.campaign_id = c.id GROUP BY c.id;
CREATE VIEW IF NOT EXISTS v_ar_aging AS SELECT d.id, d.customer_id, d.amount - d.paid AS remain, d.due_date, d.status FROM debts d WHERE d.type = 'receivable' AND d.status IN ('open','overdue');
CREATE VIEW IF NOT EXISTS v_sla_breach AS SELECT id, code, priority, sla_due FROM tickets WHERE status IN ('open','processing') AND sla_due IS NOT NULL AND sla_due < CURRENT_TIMESTAMP;

-- Vi du upsert ANSI (migrate.js dung): INSERT INTO departments(code,name) VALUES(?,?) ON CONFLICT(code) DO NOTHING;

-- normalize tieng Viet (mau cho backend tai dung):
-- function norm(s){return s.toLowerCase().normalize('NFD').replace(/đ/g,'d').replace(/Đ/g,'d').replace(/[̀-ͯ]/g,'');}
