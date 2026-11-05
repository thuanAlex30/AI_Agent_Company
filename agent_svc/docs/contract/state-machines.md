# State machines v6.1 (nguồn duy nhất, UI vẽ dropdown từ đây, backend enforce)

- orders(draft→pending_approval→pending→approved→in_progress→done→paid; pending|approved|in_progress→partial→paid; draft|pending_approval|pending|approved|in_progress→cancelled khi chưa có payments; paid|partial→refunded qua returns-flow P2 với payments âm + hoàn kho theo order_items): done khi mọi shipments done + qa pass; paid khi SUM(payments)>=amount; partial khi 0<SUM(payments)<amount.
- debts(open→done; open→overdue→done; open→cancelled khi order cancelled/refunded).
- shipments(pending→shipping→done|failed; failed→shipping (attempt+1); pending|shipping→cancelled).
- purchase_orders(draft→pending_approval→approved→sent→received→(stock in + payable); rejected|cancelled).
- contracts(draft→pending_approval→legal_review→approved→signed; rejected|terminated).
- leads(new→mql→sql→quoted→negotiating→won|lost).
- tickets(open→processing→resolved→closed; resolved→open (reopen_count+1)).
- approvals(pending→approved|rejected; cấm chuyển tiếp sau decided).
- SLA tính theo GIỜ LỊCH (calendar hours, sla_due = created + sla_hours manifest.conventions.sla_hours), lưu UTC, hiển thị Asia/Ho_Chi_Minh; SLA_BREACH dùng ở helpdesk.listSLA + alert.
