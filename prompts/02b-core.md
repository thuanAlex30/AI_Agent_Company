# PROMPT 02b v6.1 — CORE TIỀN-HÀNG P1 (O2C + đối soát ghi payment)

> Precondition: 02a xanh. Đọc contract: manifest.conventions (SLA/timezone/DSO), enums, state-machines.md v6.1, table-ownership.json, approval-matrix.json v6.1 (expense/PO: leader<5tr, manager<50tr, cfo<200tr, ceo≥200tr), invariants.sql v6.1.

```Prompt
# 1. PRECONDITIONS: verify + test 02a xanh. Dán output.
# 2. EXPORTS (async, đúng biên ownership — verify lint)
- `src/modules/sales/service.js`: createOrder, setOrderPaid(conn,orderId,actor), cancelOrder (chỉ khi chưa có payments; đã paid phải refundOrder), refundOrder (payments âm + hoàn kho theo order_items + status refunded), convertLead. sales CHỈ write leads/quotes/contracts/orders/order_items/customers; debts qua finance.createReceivable(conn), payable qua finance.createPayable(conn), kho qua supply.moveStock(conn), vận đơn qua supply.createShipment(conn). CẤM INSERT/UPDATE debts/shipments/stock_moves/payments.
- `src/modules/supply/service.js`: moveStock, createShipment, setShipment, createPO, receivePO (approved→received → stock in + payable qua finance.createPayable(conn) — CẤM INSERT debts trực tiếp).
- `src/modules/finance/service.js`: createReceivable, createPayable, recordPayment (Idempotency-Key, kiểm remain + khóa dòng FOR UPDATE ở pg / tx ở sqlite, audit cùng tx, cấm sửa paid tay), runReconciliation, classifyDebts, buildReminderMessage, financeKpis (DSO=AR/(revenue_orders_30d/30) với revenue từ orders KHÔNG cộng transactions), cashflow (thu từ payments debt_id, chi từ payments expense_id), remindDebt (ghi reminder_log, UNIQUE debt+date), remindAll (US-FIN-02), markOverdue. finance CẤM UPDATE/INSERT orders/order_items/shipments/stock_moves — qua sales.setOrderPaid(conn).
- `src/routes/{sales.js,supply.js,finance.js}` + `tests/{reconcile,order-stock-debt,payments,p2p}.test.js` + `tests/fixtures/statement.csv` (10 dòng: 8 khớp gồm 1 partial + 1 trùng bank_ref + 1 rác).
# 3. ĐỐI SOÁT: bắt buộc có mã; điểm mã order +60, mã KH +40, remain chênh <1000đ +40, <1% +20, ngày ≤3 +10, ≤7 +5; ngưỡng ≥80 (KH-only 40+40 pass, tiền đơn độc 40 fail). Hòa max → review (unmatched). So REMAIN. Mỗi match: trong tx tạo payments{debt_id,order_id,amount=tx.amount,method:bank} qua recordPayment + transactions→matched + sales.setOrderPaid khi hết remain + audit. normalize NFD + đ/Đ→d/D.
# 4. CỔNG DUYỆT THẬT (approval-matrix v6.1): contract ≥50tr hoặc rủi ro → orders pending_approval tới khi signed; PO/expense chưa approved → receivePO/recordPayment(expense) 403 APPROVAL_REQUIRED. State machine v6.1 mọi chuyển trạng thái (orders done khi shipments done + qa pass; paid khi SUM(payments)≥amount; partial khi 0<sum<amount; cancelled chỉ khi chưa có payments).
# 5. API: GET/POST /api/customers (+/:id), GET/POST /api/quotes|contracts (+/:id/submit-approval), GET/POST /api/orders (+/:id/cancel +/:id/refund, header Idempotency-Key), POST /api/leads/:id/convert, supply routes, finance routes (transactions GET/POST, import-csv field file, reconcile/run, debts, payments Idempotency-Key, expenses, kpis, reminders, budgets). Múi giờ VN cho due/+7d.
# 6. CẤM: trigger rollup (chỉ service cộng), sửa paid tay, đếm revenue từ transactions, GLOB/DATETIME/INSERT OR IGNORE.
# 7. NGHIỆM THU: CSV 10 → imported 9/skipped 1/matched 8 (≥80%); partial DH001 khớp remain; cùng tiền khác mã không khớp nhầm; đ→d khớp; bấm đúp cùng Idempotency-Key không đúp; invariants.sql 0 dòng; verify PASS ownership. Dán output.
# 8. GIỚI HẠN: 3 service + 3 route + 4 test + CSV.
```
