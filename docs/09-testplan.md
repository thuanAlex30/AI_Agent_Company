# 09 — Test plan v6.1 (tóm tắt, map ở traceability.csv)

- Khung vitest/jest + supertest; CI matrix SQLite + Postgres; cổng `verify` + test xanh mới merge.
- P0 ≥6 (auth 4 + audit 2). P1: reconcile (khớp đúng/partial/sai mã/trùng bank_ref/đ→d), order-stock-debt (trừ kho/thiếu rollback/hủy hoàn kho/refund/biên module), payments (cộng dồn/quá remain/idempotency), p2p (PO duyệt→nhận→in→payable), approval (tự duyệt/sai level/cổng chặn), invariants.sql 0 dòng.
- P2: sla (urgent 2h/high 4h/reopen FCR/SLA_BREACH), roi (VIEW khớp leads thật), hr (chấm hộ 403/lọc lương/payroll).
- P3: chat-rule.test.js (100 câu, ≥85, 0 hứa bậy, bẫy kho/không, ten/te, giao không ticket, giảm 50%, lộ cost, 50tr, injection) chạy CI; LLM chạy job riêng `test:llm`.
- Fixtures duy nhất: `tests/fixtures/statement.csv` (10 dòng: 8 khớp gồm 1 partial + 1 trùng + 1 rác) + `tests/fixtures/chat-cases-100.json` (100 câu).
