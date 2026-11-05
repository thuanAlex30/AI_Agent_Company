# 04 — Architecture v6 (biên module thực thi bởi lint)

- Modular monolith, 1 lớp DB async (`src/common/db.js`), service per-ban, route per-ban, ownership tại `docs/contract/table-ownership.json` (verify parse SQL enforce).
- Sở hữu: sales (leads/quotes/contracts/orders/order_items/customers) — debts qua finance.createReceivable, kho/vận đơn qua supply; supply (products/stock_moves/PO/suppliers/shipments/sop); finance (transactions/debts/payments/expenses/budgets/reminder_log) — cấm UPDATE orders/shipments trực tiếp, qua sales.setOrderPaid; helpdesk (messages/tickets/ratings); hr (+users); governance (approvals/audit/risks); it/qa/product riêng.
- Vòng kín: O2C (lead→quote→contract [cổng duyệt]→order→kho/nợ/ship→thu→done→refund), P2P (PO→duyệt→nhận→in→payable→chi), H2R (NV→chấm công JWT→payroll-preview).
- Cron duy nhất `src/common/scheduler.js` (8h VN nhắc nợ, */5 sop, 2h backup, 8h05 brief).
