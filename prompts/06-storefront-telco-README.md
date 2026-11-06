# PROMPT 06 v6.1 — STOREFRONT CHUẨN TELCO-GRADE (adapt từ prompt viettel.vn/vx → BizOps Café)

> Bộ 06 adapt từ prompt telecom 24 mục của bạn để bám sát hệ thống BizOps AI v6.1 thật. Chạy sau P1 (migration 002 + /api/public đọc đã xanh). Mỗi file xong DỪNG chờ `OK mới làm tiếp`.

## Quy tắc adapt (bắt buộc, khác bản telecom gốc)

- **Brand:** BizOps Café (F&B café/trà/bánh), KHÔNG dùng logo/trademark/ảnh Viettel, KHÔNG giả mạo viettel.vn. Chỉ tái tạo UX pattern + information architecture + component behavior.
- **Domain map:** mobile/data/sim/esim/internet/tv/camera/devices → cafe/tra/banh/combo/dich-vu (DV-TEABREAK, DV-GIAO-TAN-NOI, DV-HOA-DON-VAT). Package cards (data/voice/sms/5G) → product cards (giá/khối lượng/quyền lợi) + service cards (slot/party-size/location/MST).
- **Account/login/OTP/subscriptions → Tra cứu đơn không đăng nhập:** `GET /api/public/orders/:code` (mã DHxxx + SĐT, token phụ), KHÔNG làm login/register khách (giữ ERP login riêng).
- **Backend thật:** chỉ gọi `GET /api/public/products|services|banners|promotions`, `POST /api/public/orders|service-requests`, `POST /api/public/payments/webhook`, `POST /api/public/chat`. Giá do server `resolvePrice()` (theo giờ/kênh), tồn chỉ `in_stock/out_of_stock`, KHÔNG lộ `cost`/tồn số. Tiền BIGINT, UTC→Asia/Ho_Chi_Minh, namespace `backend/src/public/`, rate-limit + CORS `:5174`, verify + test PASS.
- **Stack:** storefront/ React + Vite + TypeScript strict + Tailwind + React Router + Zustand (cart/compare/fav) + TanStack Query (products/services/promos) + Axios + Lucide + Framer Motion (nhẹ). Type tách `types/`, data tách `mock*.ts` → thay bằng API thật (không hard-code trong component).
- **Kỷ luật BizOps:** 1 lớp DB, migration 002, ownership (supply/sales/finance/helpdesk), openapi/manifest/traceability, audit, guardrail agent public (knowledge_public, AGENT_PUBLIC_KEY, 0 leak).

## Thứ tự file

- `06a-telco-audit-ia.md` — Phase 1-2: audit viettel.vn/vx + IA BizOps Café (ghi rõ trang nào không truy cập được → phương án tương đương)
- `06b-telco-design-system.md` — Phase 3-5: design tokens + component library + Header/Footer (sticky, mega-menu, drawer mobile)
- `06c-telco-home-catalog-detail.md` — Phase 6-9: Home + Catalog + Detail + Search/Filter/Sort + Compare
- `06d-telco-cart-checkout-lookup.md` — Phase 10-11: Cart → Checkout → Lookup (thay Account) + thanh toán COD/VietQR + webhook
- `06e-telco-quality-go-live.md` — Phase 12-15: responsive/a11y/perf/SEO + audit cuối + bàn giao

## CONTEXT dán kèm mọi prompt 06

```text
BizOps Café | F&B café/trà/bánh | CF-SUA-01 35k, TRA-DAO-01 40k, BANH-01 25k, COMBO-SANG 55k (trừ kho thành phần) | DV teabreak/giao/VAT (đặt lịch + báo giá chi tiết) | COD + VietQR tĩnh + ví | TV, VND, Asia/Ho_Chi_Minh
BACKEND :3000 (/api/public/*) | AGENT :3100 (/public-chat) | ERP :5173 (nội bộ, cấm public) | STOREFRONT :5174 (public)
```
