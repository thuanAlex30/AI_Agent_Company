# ADR-0011: v6 — biến văn bản thành khóa chạy được (trả lời đánh giá v5)

Ngày: 2026-11-05 | Trạng thái: chấp nhận | Thay thế: toàn bộ prompt v5

## Quyết định
1. **Bỏ `inventory`** (nguồn tồn thứ hai, cùng lỗi đã cấm ở campaigns). Chốt **35 bảng**: 33 nghiệp vụ + `reminder_log` + `refresh_tokens`. Mọi con số 30/31/32/33 cũ vô hiệu. Nguồn sự thật duy nhất: `docs/contract/manifest.json` (LLM không được gõ số tay).
2. **Gói hợp đồng `docs/contract/`**: manifest, enums.json (sinh CHECK SQL + hằng JS + dropdown UI), roles-permissions.json, state-machines.md, approval-matrix.json, openapi.yaml, traceability.csv. Prompt chỉ trỏ vào, cấm lặp sự thật.
3. **`npm run verify` là cổng bắt buộc**: đếm bảng từ manifest, enum SQL khớp enums.json, lint sở hữu bảng, cron chỉ ở scheduler.js, route có test + UI gọi, cấm seed/dev-header ở prod, CI chạy SQLite + Postgres.
4. **Bất biến `invariants.sql`**: debts.paid=SUM(payments), tồn≥0, AR=tổng remain, tiền/kho có audit cùng transaction, 1 bank_ref đúng 1 payment.
5. **BIGINT tiền, TIMESTAMP UTC + Asia/Ho_Chi_Minh ở tầng hiển thị/logic giờ**, `ON CONFLICT DO NOTHING`, migration per-dialect + CI 2 DB.
6. **Sắp phase lại**: P0 (01+02a, ≥6 test), P1 (02b+02d-1+scheduler+server+03a kèm tab Ops và login, overview stub P2), P2 (02c+02d-2+03b+03c), P3 (04, chat endpoint sinh cùng 04).
