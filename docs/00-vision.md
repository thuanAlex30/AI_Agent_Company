# 00 — Vision v6.1 (hiến pháp hiện hành, thay mọi bản v5)

> Nguồn sự thật chi tiết: `docs/contract/` (manifest, enums, openapi, approval-matrix, state-machines, invariants, ownership, traceability). File này chỉ chốt hướng, không lặp số.

## 1. Scope chốt (đọc từ manifest.json, cấm gõ tay)
- **12 departments** theo `manifest.departments12`; `supply` gộp Mua+Kho+Logistics (phân biệt bằng `title`).
- **35 bảng**: 33 nghiệp vụ + `reminder_log` (enforce 1 tin/ngày/khoản) + `refresh_tokens` (xoay vòng JWT). Đã bỏ `inventory` (nguồn tồn thứ hai).
- Tiền **BIGINT (đồng)**, thời gian **TIMESTAMP UTC** + logic **Asia/Ho_Chi_Minh**, upsert `ON CONFLICT DO NOTHING`.

## 2. Nguyên tắc sắt
1. Data trước AI sau — P1 cấm AI, chỉ rule/log.
2. Mọi write tiền/kho/duyệt bọc `tx + writeAudit(conn,...)` cùng transaction.
3. Biên module thực thi bởi `verify.js` + `table-ownership.json` (sales/finance/supply/auth đúng biên).
4. Async từ đầu; migration per-dialect (`001_init.sql` SQLite + `001_init.postgres.sql`); CI chạy cả 2 DB.
5. Bảo mật P1: JWT access 8h + refresh xoay vòng + lock + RBAC + lọc field backend (roles-permissions.json).
6. Mọi con số/enum/SLA/role chỉ sống trong `docs/contract/`; docs và prompt khác chỉ trỏ vào.

## 3. Lộ trình (chi tiết ở 02-roadmap v6.1)
P0 (01+02a, ≥6 test) → P1 (02b+02d-1+03a, core tiền-hàng + duyệt + scheduler + login + tab Ops) → P2 (02c+02d-2+03b/03c, người+KH + overview 12 khối) → P3 (04, AI rule-xác định CI + LLM riêng) → P4 nhân rộng. Không xong DoD không sang phase.
