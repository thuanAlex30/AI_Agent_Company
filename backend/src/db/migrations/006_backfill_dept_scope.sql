-- 006_backfill_dept_scope.sql (SQLite)
-- Phase 3 (P0-3/4/5) — BACKFILL `resource_dept` cho du lieu TAO TRUOC migration 005.
--
-- VAN DE: du lieu cu (tu seed demo hoac san xuat truoc Phase 3) khong co dong
-- trong `resource_dept`. => `assertBusinessScope` FAIL-CLOSED se tra 403 cho
-- MOI du lieu cu => he thong "chết" sau khi deploy migration 005.
--
-- FIX: backfill theo dung quy tac 4.2 cua prompt.
--   - `CROSS JOIN (SELECT code FROM departments WHERE code='<fallback>')`:
--     neu phong ban fallback khong ton tai (DB rong / chua seed) => 0 dong =>
--     backfill im lang, KHONG loi FK.
--   - `ON CONFLICT(table_name, record_id) DO NOTHING` => idempotent.
--   - `WHERE true` o CUOI moi cau `INSERT ... SELECT`: bat buoc cho ca SQLite
--     va PostgreSQL de tranh ambiguity giua `ON` cua JOIN va `ON CONFLICT`.
--
-- LUU Y: day la migration DATA (khong phai DDL). Chay 1 lan; neu chay lai
-- thi khong lam gi (ON CONFLICT DO NOTHING).

-- ---------------------------------------------------------------- customers
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'customers', c.id, COALESCE(ed.code, fb.code), c.owner_employee_id
FROM customers c
LEFT JOIN (SELECT e.id AS emp_id, d.code FROM employees e JOIN departments d ON d.code = e.dept_code) ed
       ON ed.emp_id = c.owner_employee_id
CROSS JOIN (SELECT code FROM departments WHERE code = 'sales') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- -------------------------------------------------------------------- leads
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'leads', l.id, COALESCE(ed.code, fb.code), l.owner_employee_id
FROM leads l
LEFT JOIN (SELECT e.id AS emp_id, d.code FROM employees e JOIN departments d ON d.code = e.dept_code) ed
       ON ed.emp_id = l.owner_employee_id
CROSS JOIN (SELECT code FROM departments WHERE code = 'sales') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- ------------------------------------------------------------------- orders
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'orders', o.id, COALESCE(ed.code, fb.code), o.employee_id
FROM orders o
LEFT JOIN (SELECT e.id AS emp_id, d.code FROM employees e JOIN departments d ON d.code = e.dept_code) ed
       ON ed.emp_id = o.employee_id
CROSS JOIN (SELECT code FROM departments WHERE code = 'sales') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- ------------------------------------------------------ order_items (theo don)
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'order_items', oi.id, COALESCE(od.dept_code, fb.code), NULL
FROM order_items oi
LEFT JOIN (
  SELECT oi2.id AS oi_id, rd.dept_code
  FROM order_items oi2
  JOIN orders o ON o.id = oi2.order_id
  LEFT JOIN resource_dept rd ON rd.table_name = 'orders' AND rd.record_id = o.id
) od ON od.oi_id = oi.id
CROSS JOIN (SELECT code FROM departments WHERE code = 'sales') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- ------------------------------------------------------ quotes/contracts (KH)
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'quotes', q.id, COALESCE(cd.dept_code, fb.code), NULL
FROM quotes q
LEFT JOIN (
  SELECT q2.id AS q_id, rd.dept_code
  FROM quotes q2
  LEFT JOIN customers cu ON cu.id = q2.customer_id
  LEFT JOIN resource_dept rd ON rd.table_name = 'customers' AND rd.record_id = cu.id
) cd ON cd.q_id = q.id
CROSS JOIN (SELECT code FROM departments WHERE code = 'sales') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'contracts', ct.id, COALESCE(cd.dept_code, fb.code), NULL
FROM contracts ct
LEFT JOIN (
  SELECT ct2.id AS ct_id, rd.dept_code
  FROM contracts ct2
  LEFT JOIN customers cu ON cu.id = ct2.customer_id
  LEFT JOIN resource_dept rd ON rd.table_name = 'customers' AND rd.record_id = cu.id
) cd ON cd.ct_id = ct.id
CROSS JOIN (SELECT code FROM departments WHERE code = 'sales') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- --------------------------------------------------------------- shipments
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'shipments', s.id, COALESCE(od.dept_code, fb.code), NULL
FROM shipments s
LEFT JOIN (
  SELECT s2.id AS s_id, rd.dept_code
  FROM shipments s2
  LEFT JOIN resource_dept rd ON rd.table_name = 'orders' AND rd.record_id = s2.order_id
) od ON od.s_id = s.id
CROSS JOIN (SELECT code FROM departments WHERE code = 'supply') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- ------------------------------------------------------------------- debts
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'debts', d.id, COALESCE(od.dept_code, fb.code), NULL
FROM debts d
LEFT JOIN (
  SELECT d2.id AS d_id, rd.dept_code
  FROM debts d2
  LEFT JOIN resource_dept rd ON rd.table_name = 'orders' AND rd.record_id = d2.order_id
) od ON od.d_id = d.id
CROSS JOIN (SELECT code FROM departments WHERE code = 'finance') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- ----------------------------------------------------------------- payments
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'payments', p.id, COALESCE(dd.dept_code, fb.code), NULL
FROM payments p
LEFT JOIN (
  SELECT p2.id AS p_id, rd.dept_code
  FROM payments p2
  LEFT JOIN debts d ON d.id = p2.debt_id
  LEFT JOIN resource_dept rd ON rd.table_name = 'debts' AND rd.record_id = d.id
) dd ON dd.p_id = p.id
CROSS JOIN (SELECT code FROM departments WHERE code = 'finance') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- -------------------------------------------- bang nghiep vu co fallback cung
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT t.tbl, t.id, fb.code, NULL
FROM (
  SELECT 'expenses' AS tbl, id FROM expenses
  UNION ALL SELECT 'transactions', id FROM transactions
  UNION ALL SELECT 'reminder_log', id FROM reminder_log
) t
CROSS JOIN (SELECT code FROM departments WHERE code = 'finance') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- approvals fallback 'ceo' khi chua co du lieu de suy ra (khong ghi de dong 'finance').
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'approvals', a.id, fb.code, NULL
FROM approvals a
CROSS JOIN (SELECT code FROM departments WHERE code = 'ceo') fb
WHERE NOT EXISTS (SELECT 1 FROM resource_dept rd WHERE rd.table_name = 'approvals' AND rd.record_id = a.id)
ON CONFLICT(table_name, record_id) DO NOTHING;

INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT t.tbl, t.id, fb.code, NULL
FROM (
  SELECT 'stock_moves' AS tbl, id FROM stock_moves
  UNION ALL SELECT 'purchase_orders', id FROM purchase_orders
  UNION ALL SELECT 'suppliers', id FROM suppliers
) t
CROSS JOIN (SELECT code FROM departments WHERE code = 'supply') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'qa_checks', id, fb.code, NULL
FROM qa_checks
CROSS JOIN (SELECT code FROM departments WHERE code = 'qa') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'campaigns', id, fb.code, NULL
FROM campaigns
CROSS JOIN (SELECT code FROM departments WHERE code = 'marketing') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'risks', id, fb.code, NULL
FROM risks
CROSS JOIN (SELECT code FROM departments WHERE code = 'legal') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'it_incidents', id, fb.code, NULL
FROM it_incidents
CROSS JOIN (SELECT code FROM departments WHERE code = 'it') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'product_features', id, fb.code, NULL
FROM product_features
CROSS JOIN (SELECT code FROM departments WHERE code = 'product') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- ---------------------------------------------------------- tickets/ratings
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'tickets', t.id, COALESCE(cd.dept_code, fb.code), NULL
FROM tickets t
LEFT JOIN (
  SELECT t2.id AS t_id, rd.dept_code
  FROM tickets t2
  LEFT JOIN customers cu ON cu.id = t2.customer_id
  LEFT JOIN resource_dept rd ON rd.table_name = 'customers' AND rd.record_id = cu.id
) cd ON cd.t_id = t.id
CROSS JOIN (SELECT code FROM departments WHERE code = 'cskh') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'ratings', r.id, COALESCE(cd.dept_code, fb.code), NULL
FROM ratings r
LEFT JOIN (
  SELECT r2.id AS r_id, rd.dept_code
  FROM ratings r2
  LEFT JOIN customers cu ON cu.id = r2.customer_id
  LEFT JOIN resource_dept rd ON rd.table_name = 'customers' AND rd.record_id = cu.id
) cd ON cd.r_id = r.id
CROSS JOIN (SELECT code FROM departments WHERE code = 'cskh') fb
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- ------------------------------------------------- sop_tasks (cot dept_code that)
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'sop_tasks', s.id, s.dept_code, NULL
FROM sop_tasks s
JOIN departments d ON d.code = s.dept_code
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;

-- --------------------------------------------------------- budgets (dept_code that)
INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
SELECT 'budgets', b.id, b.dept_code, NULL
FROM budgets b
JOIN departments d ON d.code = b.dept_code
WHERE true
ON CONFLICT(table_name, record_id) DO NOTHING;
