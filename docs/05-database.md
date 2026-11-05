# 05 — Database v6.1 (tóm tắt, chi tiết sống ở contract + migration)

- 35 bảng theo `manifest.json` (đã bỏ `inventory`; có `reminder_log` UNIQUE(debt_id,sent_date) + `refresh_tokens`).
- Tiền BIGINT, TIMESTAMP UTC, `ON CONFLICT DO NOTHING`, migration per-dialect, VIEW `v_campaign_roi/v_stock_onhand/v_ar_aging/v_sla_breach`.
- Ràng buộc: stock_moves CHECK dấu (`in`>0/`out`<0/`adjust`<>0) + append-only; debts CHECK(paid 0..amount) + receivable bắt buộc customer; payments CHECK đúng-1-trong-2 (debt_id/expense_id) + idempotency UNIQUE; audit_log/payments append-only; budgets month CHECK `LIKE '____-__'` (ANSI, cấm GLOB).
- Trigger dialect-riêng: SQLite dùng `RAISE(ABORT,...)` trong `001_init.sql`; Postgres dùng `RAISE EXCEPTION` trong `001_init.postgres.sql`. Verify kiểm tra riêng từng file (không cấm tuyệt đối).
- Seed dev có COO + CS Team Leader + users bcrypt (không seed prod).
