-- invariants.sql v6.1 — ANSI, chay duoc ca SQLite lan Postgres trong test + cron dem. Vi pham 1 dong = fail.
-- I1: debts.paid = SUM(payments theo debt_id)
SELECT 'I1 paid-mismatch' AS inv, d.id FROM debts d
WHERE d.paid <> COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.debt_id = d.id), 0);
-- I1b: expenses.paid = SUM(payments theo expense_id)
SELECT 'I1b expense-paid-mismatch' AS inv, e.id FROM expenses e
WHERE e.paid <> COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.expense_id = e.id), 0);
-- I2: ton kho khong am
SELECT 'I2 negative-stock' AS inv, product_sku, SUM(qty) AS stock FROM stock_moves GROUP BY product_sku HAVING SUM(qty) < 0;
-- I3: AR board (service kiem: SELECT SUM(amount-paid) FROM debts WHERE type='receivable' AND status IN ('open','overdue'))
-- I4: moi write tien/kho co audit (khong loc thoi gian de trung dialect; test tao du lieu moi thi kiem trong pham vi test)
SELECT 'I4 missing-audit-payments' AS inv, p.id FROM payments p
WHERE NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.table_name = 'payments' AND a.record_id = p.id);
SELECT 'I4 missing-audit-stock' AS inv, s.id FROM stock_moves s
WHERE NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.table_name = 'stock_moves' AND a.record_id = s.id);
-- I5: khong double-count — moi bank_ref matched chi duoc tao toi da 1 payment chuan (phat hien payments trung order_id + amount + method bank trong cung ngay)
SELECT 'I5 dup-payment' AS inv, p.order_id, p.amount, COUNT(*) AS c FROM payments p
WHERE p.method = 'bank' AND p.order_id IS NOT NULL GROUP BY p.order_id, p.amount HAVING COUNT(*) > (SELECT COUNT(*) FROM transactions t WHERE t.matched_order_id = p.order_id AND t.status = 'matched');
-- I6: stock_moves dau dung loai
SELECT 'I6 bad-sign' AS inv, id FROM stock_moves WHERE (type = 'in' AND qty <= 0) OR (type = 'out' AND qty >= 0) OR (type = 'adjust' AND qty = 0);
-- I7: debts paid trong [0, amount]
SELECT 'I7 paid-range' AS inv, id FROM debts WHERE paid < 0 OR paid > amount;
-- I8: reminder 1 tin/ngay/khoan (UNIQUE thuc thi, day la kiem phong)
SELECT 'I8 dup-reminder' AS inv, debt_id, sent_date, COUNT(*) AS c FROM reminder_log GROUP BY debt_id, sent_date HAVING COUNT(*) > 1;
