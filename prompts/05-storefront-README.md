# PROMPT 05 v6.1 — STOREFRONT CHUẨN VIETTEL TELECOM (web khách hàng public + /api/public/* + agent public)

> Chuỗi prompt 05a → 05f chạy lần lượt. Mỗi prompt xong DỪNG chờ gõ `OK mới làm tiếp`. Không gộp prompt. Chỉ prompt ở bước này, chưa code.

## 1. Tầm nhìn sản phẩm (mục tiêu cuối)

Xây `storefront/` (React 18 + Vite, port 5174, tiếng Việt, mobile-first) đạt đẳng cấp như **vietteltelecom.vn**: topbar tiện ích (hotline, cửa hàng, tra cứu, hỗ trợ) → mega-menu (Sản phẩm / Dịch vụ / Khuyến mãi / Hỗ trợ / Tin tức) → hero carousel 3 banner + 4 quick-action → lưới danh mục → flash-sale/combo → danh sách SP có lọc-tìm-sắp xếp → chi tiết SP (ảnh, giá, còn/hết hàng, đánh giá) → giỏ + checkout 1 trang → xác nhận + tra cứu đơn → thanh toán COD/VietQR/ví → footer 4 cột + nút nổi hotline/chat/Zalo. Tốc độ <2s, responsive 360px→1440px, SEO title/meta/sitemap/OG.

## 2. Biến dự án (đã chốt, dán kèm mọi prompt)

```text
TEN_THUONG_HIEU = BizOps Café
NGANH_HANG = F&B — café, trà trái cây & bánh ngọt (mang đi + giao hàng + tại quán)
DANH_SACH_SAN_PHAM = CF-SUA-01 Cà phê sữa 35.000đ/ly; TRA-DAO-01 Trà đào 40.000đ/ly; BANH-01 Bánh ngọt 25.000đ/cái; COMBO-SANG (cà phê + bánh, giá combo)
DANH_SACH_DICH_VU = DV-TEABREAK Tiệc teabreak văn phòng; DV-GIAO-TAN-NOI Giao hàng có mã vận đơn; DV-HOA-DON-VAT Xuất HĐ VAT + hợp đồng
HINH_THUC_DICH_VU = CA_HAI (đặt lịch + báo giá)
THANH_TOAN = COD + VietQR/bank + ví điện tử (cash/bank/ewallet)
ORIGIN_STOREFRONT_DEV = http://localhost:5174
ORIGIN_ERP = http://localhost:5173 (NỘI BỘ, cấm public)
BACKEND = http://localhost:3000
AGENT = http://localhost:3100
```

## 3. Thứ tự file (đọc theo số)

- `05a-storefront-p0-doc-ke-hoach.md` — GĐ1: đọc repo + báo cáo Viettel-gap + kế hoạch (dừng chờ OK)
- `05b-storefront-p1-contract-migration-api-doc.md` — GĐ2: migration 002 + contract + API public chỉ-đọc (nền cho catalog kiểu Viettel)
- `05c-storefront-p2-catalog-gio-checkout.md` — GĐ3: khung Viettel (header/hero/footer) + catalog + giỏ + checkout → đơn ERP
- `05d-storefront-p3-tracuu-thanhtoan-webhook.md` — GĐ4: tra cứu đơn + thanh toán + webhook → kế toán
- `05e-storefront-p4-chat-public-eval.md` — GĐ5: chat agent public + eval đối kháng (widget kiểu Viettel)
- `05f-storefront-p5-security-docker-readme.md` — GĐ6: design polish + bảo mật + docker + README + bàn giao
- `05x-storefront-khi-ket.md` — Prompt phụ khi kẹt / review nhanh

## 4. Quy ước cứng xuyên suốt 05 (vi phạm = fail)

- Tiền BIGINT VND nguyên, cấm thập phân; giờ DB UTC, hiển thị Asia/Ho_Chi_Minh; 1 lớp DB `backend/src/common/db.js` + `tx()`; không UPDATE chéo module (sales→finance/supply qua service, finance→sales qua `setOrderPaid`).
- Mọi schema mới qua `backend/src/db/migrations/002_storefront.sql` + `002_storefront.postgres.sql` (migrate 2 dialect, `ON CONFLICT DO NOTHING`, cấm `INSERT OR IGNORE/PRAGMA/DATETIME/GLOB`); qua `npm run verify` + `npm test`.
- Namespace `backend/src/public/` riêng, KHÔNG dùng `authenticate/requirePerm` nhân viên; CORS chỉ origin storefront; rate-limit IP riêng chặt hơn `apiLimiter`; validate `common/validate.js` + sanitize + body-limit; không lộ stack trace, `cost`, tồn số thực, lương.
- Cập nhật `docs/contract/` (openapi, manifest, traceability, table-ownership) cho mọi bảng/endpoint mới.
- Mỗi giai đoạn kết thúc bằng: danh sách file đổi | lệnh chạy thử | kết quả verify/test | điều cần quyết định. Kết thúc bằng câu chờ OK.
