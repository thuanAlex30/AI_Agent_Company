# PROMPT 03a v6.1 — P1 UI (login + CEO rút gọn + Sales + Finance + Ops)

> Precondition: 02b + 02d-1 xanh. Thuộc P1.

```Prompt
# 1. PRECONDITIONS: API P1 + approvals + scheduler xanh. Đọc openapi.yaml v6.1.0, manifest.conventions (cờ [CẦN-DUYỆT] có gạch nối, SLA, BIGINT vi-VNđ).
# 2. EXPORTS: `public/index.html` (khung) + `public/css/app.css` + `public/js/{core.js,auth.js,router.js,tabs/ceo.js,tabs/sales.js,tabs/finance.js,tabs/ops.js}` (tách module — cấm 1 file 1800 dòng + cấm nối bằng comment).
# 3. ĐẶC TẢ: màn hình login (POST /api/auth/login + refresh/logout/me; JWT httpOnly cookie + refresh, cấm x-user-code ở prod — dev guard có cảnh báo); header vai từ /auth/me + permissions; tab CEO P1 CHỈ sales/supply/finance + approvals tồn (khối P2 hiện stub 'P2'); Sales (lead→convert→đơn→hủy/hoàn + Idempotency-Key client-uuid, state-machine dropdown từ enums); Finance (debts + Nhắc + Nhắc tất cả + payments + đối soát + review khi hòa điểm + [CẦN-DUYỆT]); Ops (products tồn đỏ + nhập/xuất + shipments + PO + receive). core.js: api(), fmt BIGINT vi-VNđ (cấm thập phân đồng), escapeHTML (cấm innerHTML dữ liệu nhập), pill, timeLeft VN. CSP không inline script.
# 4. CẤM: chọn vai giả + x-user-code ở prod, 1-file HTML, lộ salary_base (backend đã lọc — UI không tự gọi field đó).
# 5. NGHIỆM THU: console sạch; E2E lead→convert→đơn→nhắc→payment→hủy hoàn kho; warehouse 403 debts-write; CSV hiện review; chưa login không gọi API. Dán checklist + console.
```
