# PROMPT 01 v6.1 — DATABASE (nguồn duy nhất: docs/contract/)

> Chạy đầu tiên. Không API/UI/AI.

```Prompt
# 1. PRECONDITIONS
- Đọc: docs/contract/manifest.json (35 bảng trong manifest.tables — CẤM gõ số tay; SLA/timezone/DSO đọc ở manifest.conventions, KHÔNG ở root), enums.json, state-machines.md v6.1, approval-matrix.json v6.1, table-ownership.json, ADR-0011.
- `node scripts/verify.js` được phép FAIL (chưa có migration) — dán output đầu bài.

# 2. EXPORTS
- `src/db/migrations/001_init.sql` (SQLite) + `001_init.postgres.sql` (Postgres: BIGSERIAL cho id, TIMESTAMP WITH TIME ZONE, function+trigger PG thay RAISE; logic CHECK/UNIQUE/FK giống hệt).
- `src/db/migrate.js`: export `async function migrate()` — chọn file theo dialect, chạy từng statement trong tx, ghi `schema_migrations(version, applied_at)`, seed CHỈ khi NODE_ENV!=production và users trống.
- `src/common/db.js`: export `{query,get,all,run,tx}` async — MỘT lớp duy nhất. better-sqlite3 bọc Promise; pg pool. Placeholder qua adapter, cấm nối chuỗi. Helper `nowVN()/todayVN()` (Asia/Ho_Chi_Minh, DB lưu UTC).
- VIEW: `v_campaign_roi`, `v_stock_onhand(sku,stock)`, `v_ar_aging`, `v_sla_breach` (định nghĩa ở table-ownership.json views).

# 3. ĐẶC TẢ ĐỦ CỘT (cấm "như v4")
- Chuẩn: tiền BIGINT (đồng, cấm thập phân), thời gian TIMESTAMP UTC, mọi bảng `created_at` + `updated_at` (trừ log append-only chỉ created_at), FK ON DELETE RESTRICT (trừ order_items CASCADE).
- departments(code PK 12 mã manifest.departments12, name, head_employee_id NULL, budget_month BIGINT DEFAULT 0, created_at, updated_at). Seed đúng 12.
- users(id, employee_code UNIQUE NULL, username UNIQUE NOT NULL, password_hash NOT NULL, role CHECK enums.roles (đủ 14 gồm legal/hr), failed_attempts INT DEFAULT 0, locked_until TIMESTAMP NULL, created_at, updated_at). Bảng này do module AUTH sở hữu (hr không write).
- refresh_tokens(id, user_id FK RESTRICT, token_hash UNIQUE NOT NULL, expires_at TIMESTAMP NOT NULL, revoked BOOLEAN DEFAULT FALSE, created_at). Auth sở hữu.
- employees(id, code UNIQUE, name, dept_code FK, title, manager_id FK NULL, phone, salary_base BIGINT CHECK>=0, left_date DATE NULL, status CHECK enums.emp_status, hired_date DATE, created_at, updated_at).
- attendance(id, employee_id FK, work_date DATE, check_in TIME NULL, check_out TIME NULL, status CHECK enums.attend_status, UNIQUE(employee_id, work_date)).
- recruitments(id, position, dept_code FK, qty CHECK>0, status [open|closed|cancelled], opened_date DATE, closed_date NULL, cost BIGINT DEFAULT 0, created_at, updated_at).
- trainings(id, employee_id FK, topic, hours REAL, status [planned|done], created_at).
- customers(id, code UNIQUE, name, phone, email NULL, address NULL, type [retail|wholesale|enterprise], owner_employee_id FK NULL, created_at, updated_at) + INDEX(phone).
- leads(id, name, phone, source NULL, campaign_id FK NULL, stage CHECK enums.lead_stage, owner_employee_id FK NULL, amount_expected BIGINT DEFAULT 0, last_touch DATE NULL, created_at, updated_at) + INDEX(stage).
- quotes(id, code UNIQUE, lead_id FK NULL, customer_id FK NULL, amount BIGINT CHECK>0, status CHECK enums.quote_status, valid_until DATE NULL, created_by NULL, created_at, updated_at).
- contracts(id, code UNIQUE, customer_id FK, quote_id FK NULL, amount BIGINT CHECK>0, status CHECK enums.contract_status, signed_date NULL, created_by NULL, created_at, updated_at).
- campaigns(id, name, channel CHECK enums.campaign_channel, cost BIGINT, start_date DATE, end_date DATE, created_at, updated_at) — CẤM cột đếm tĩnh.
- orders(id, code UNIQUE, customer_id FK, contract_id FK NULL, employee_id FK NULL, amount BIGINT CHECK>0, status CHECK enums.order_status DEFAULT 'draft', order_date DATE, idempotency_key TEXT UNIQUE NULL, created_by NULL, created_at, updated_at) + INDEX(order_date, status).
- order_items(id, order_id FK CASCADE, product_sku FK, qty INT CHECK>0, price BIGINT, cost BIGINT).
- products(sku PK TEXT, name, price BIGINT, cost BIGINT, unit DEFAULT 'cái', stock_alert INT DEFAULT 10, created_at, updated_at).
- stock_moves(id, product_sku FK, type CHECK enums.stock_type, qty BIGINT NOT NULL, ref_code NULL, idempotency_key TEXT UNIQUE NULL, created_by NULL, created_at, CHECK((type='in' AND qty>0) OR (type='out' AND qty<0) OR (type='adjust' AND qty<>0))) + append-only: file SQLite TRIGGER BEFORE UPDATE/DELETE RAISE(ABORT); file Postgres FUNCTION + TRIGGER RAISE EXCEPTION (verify chỉ cấm RAISE ở file chung? KHÔNG — verify v6.1 cho RAISE trong file dialect, cấm PRAGMA/DATETIME/GLOB trong migration).
- purchase_orders(id, code UNIQUE, supplier_id FK, amount BIGINT, status CHECK enums.po_status DEFAULT 'draft', need_date DATE NULL, idempotency_key UNIQUE NULL, created_by NULL, created_at, updated_at).
- suppliers(id, code UNIQUE, name, phone NULL, rating INT CHECK 1..5 DEFAULT 5, created_at, updated_at) — CẤM cột debt tĩnh.
- shipments(id, order_id FK, carrier NULL, tracking_code NULL, status CHECK enums.ship_status, ship_fee BIGINT DEFAULT 0, attempt INT DEFAULT 1, created_at, updated_at) + INDEX(status).
- qa_checks(id, ref_type [order|shipment|product], ref_id BIGINT, result [pass|fail], defect NULL, repeat_of INT NULL, checker NULL, created_at).
- sop_tasks(id, dept_code FK, title, owner NULL, due_date DATE NULL, status CHECK enums.sop_status, created_at, updated_at).
- transactions(id, trans_date DATE, amount BIGINT, content TEXT, bank_ref TEXT UNIQUE, matched_order_id FK NULL, status [matched|unmatched] DEFAULT 'unmatched', created_at).
- debts(id, customer_id FK NULL, order_id FK NULL, type CHECK enums.debt_type, amount BIGINT CHECK>0, paid BIGINT DEFAULT 0, due_date DATE NULL, status CHECK enums.debt_status, note NULL, created_by NULL, created_at, updated_at, CHECK(paid>=0 AND paid<=amount), CHECK((type='receivable' AND customer_id IS NOT NULL) OR type='payable')) + INDEX(status, due_date).
- payments(id, debt_id FK NULL, expense_id FK NULL, order_id FK NULL, amount BIGINT NOT NULL CHECK(amount<>0), method CHECK enums.pay_method, paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, actor TEXT NULL, note NULL, idempotency_key TEXT UNIQUE NULL, created_at, CHECK(((debt_id IS NOT NULL)::int+(expense_id IS NOT NULL)::int)=1) — viết ANSI: CHECK((CASE WHEN debt_id IS NOT NULL THEN 1 ELSE 0 END + CASE WHEN expense_id IS NOT NULL THEN 1 ELSE 0 END)=1)) + append-only (cấm UPDATE/DELETE).
- expenses(id, code UNIQUE, type CHECK enums.expense_type, supplier_id FK NULL, amount BIGINT, paid BIGINT DEFAULT 0 CHECK(paid>=0), due_date DATE NULL, note NULL, status CHECK enums.record_status DEFAULT 'open', created_by NULL, created_at NOT NULL, updated_at).
- budgets(id, dept_code FK, month TEXT CHECK(month LIKE '____-__') (ANSI, CẤM GLOB), planned BIGINT, actual BIGINT DEFAULT 0, UNIQUE(dept_code, month)).
- approvals(id, ref_type CHECK enums.approval_ref, ref_id BIGINT, requester BIGINT NOT NULL, level CHECK enums.approval_level, status CHECK enums.approval_status DEFAULT 'pending', decided_by NULL, decided_at NULL, note NULL, created_at).
- audit_log(id, actor TEXT, action TEXT, table_name TEXT, record_id BIGINT, old_json NULL, new_json NULL, created_at TIMESTAMP) + append-only. Service gọi writeAudit(conn,...) cùng tx.
- risks(id, title, level CHECK enums.risk_level, owner NULL, status CHECK enums.risk_status DEFAULT 'open', due_date NULL, created_at, updated_at).
- reminder_log(id, debt_id FK, sent_date DATE, channel, message TEXT, created_at, UNIQUE(debt_id, sent_date)).
- messages(id, customer_id FK NULL, debt_id FK NULL, direction CHECK enums.msg_direction, content, channel DEFAULT 'web', created_at).
- tickets(id, code TEXT UNIQUE, customer_id FK NULL, category CHECK enums.ticket_category (gồm policy_inquiry), subject NULL, content, status CHECK enums.ticket_status DEFAULT 'open', priority CHECK enums.ticket_priority DEFAULT 'normal', assignee NULL, sla_due TIMESTAMP NULL, first_response_at NULL, resolved_at NULL, reopen_count INT DEFAULT 0, created_at, updated_at).
- ratings(id, customer_id FK NOT NULL, order_id FK NULL, ticket_id FK NULL, stars INT NOT NULL CHECK(stars BETWEEN 1 AND 5), comment NULL, created_at).
- it_incidents(id, code TEXT UNIQUE, title, severity CHECK enums.incident_severity DEFAULT 'p3', status CHECK enums.incident_status DEFAULT 'open', assignee NULL, mttr_min INT NULL, created_at, updated_at).
- product_features(id, title, stage CHECK enums.feature_stage DEFAULT 'idea', owner NULL, adoption REAL NULL, created_at, updated_at).

# 4. CẤM: inventory, cột đếm tĩnh, INSERT OR IGNORE, DATETIME (dùng TIMESTAMP), GLOB, PRAGMA trong migration, sửa paid tay, đoạn tự suy nghĩ.
# 5. NGHIỆM THU (dán output): 1. `npm run migrate` xanh. 2. `node scripts/verify.js` ALL PASS. 3. Đếm DB type='table' NOT LIKE 'sqlite_%' AND <>'schema_migrations' = 35. 4. foreign_key_check=0. 5. in âm/out dương fail CHECK. 6. UPDATE stock_moves/audit_log/payments abort. 7. normalize "ĐH001"→"dh001" (comment hàm mẫu).
# 6. GIỚI HẠN: 4 file (2 migration + migrate.js + db.js) + seeds/demo.sql. Seed: COO + CS Team Leader + users bcrypt + 3 KH + leads + quote + contract + 2 orders + items + 1 payment 2tr + stock 100/80/5 + PO + shipment + campaign + tickets + rating có sao.
```
