# 06 — API spec v6.1 (tóm tắt, chi tiết ở openapi.yaml)

Mọi route, method, Idempotency-Key, SLA 2/4/24/72h giờ lịch, `employee_code`, DSO/retention/win_rate theo manifest — chỉ sống ở `docs/contract/openapi.yaml` + `traceability.csv`. File này cấm lặp.

- Auth: login/refresh/logout/me (refresh_tokens xoay vòng + thu hồi, fail-fast JWT_SECRET prod).
- P1: customers, leads/convert, quotes, contracts/submit-approval, orders (+cancel/refund, Idempotency), sales/kpi, supply (products/stock/ops-alerts/PO/receive/suppliers/shipments), finance (transactions/import-csv/reconcile/debts/remind/remind-all/payments/expenses/kpis/reminders/budgets).
- P2: employees (lọc salary_base backend), attendance/checkin-out (gắn JWT), hr/today, payroll-preview, recruitments/trainings, tickets (+sla/csat), ratings (stars bắt buộc), campaigns/roi (từ VIEW).
- Gov: overview (P1 rút gọn, P2 đủ 12), brief, approvals/decide, audit, risks, it-incidents, qa-checks, sop-tasks, product-features, users/unlock.
- Lỗi: VALIDATION400/AUTH401/FORBIDDEN403/APPROVAL_REQUIRED403/NOT_FOUND404/STOCK_SHORTAGE409/DUPLICATE409/SLA_BREACH422.
