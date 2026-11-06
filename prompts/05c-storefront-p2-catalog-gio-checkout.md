# PROMPT 05c v6.1 — STOREFRONT P2: khung Viettel + catalog + giỏ + checkout → đơn ERP

> Precondition: P1 xanh (migration 002 + API đọc PASS verify/test). Dựng web chuẩn Viettel, nối đơn vào ERP.

```Prompt
# VAI TRÒ: Bạn là team frontend + backend (2 người trong 1): 1 người dựng UI chuẩn Viettel, 1 người nối checkout vào ERP đúng luật.

# 1. STACK: storefront/ React 18 + Vite (dev :5174, deploy riêng), Router, fetch base URL từ env (không hardcode), VND toLocaleString('vi-VN'), ngày Asia/Ho_Chi_Minh. TUYỆT ĐỐI không phơi frontend ERP :5173. CONTEXT: BizOps Café, COD + VietQR/bank + ví.

# 2. UI CHUẨN VIETTEL (mobile-first, 360→1440, <2s, đạt mới xong):
# - Layout: Topbar (hotline, cửa hàng, tra cứu đơn, hỗ trợ) + Header sticky (logo BizOps Café, search không dấu, giỏ có badge) + Mega-menu (Cà phê / Trà / Bánh / Combo / Dịch vụ / Khuyến mãi / Tin tức) + Footer 4 cột (về chúng tôi, hỗ trợ KH, chính sách đổi trả/vận chuyển/bảo mật, liên hệ + giờ 8h-22h) + nút nổi (hotline, chat, Zalo, lên đầu trang).
# - Home: hero carousel 3 banner (từ /banners) + 4 quick-action (Đặt món / Đặt teabreak / Tra cứu đơn / Khuyến mãi) + lưới danh mục + flash-sale COMBO-SANG đếm ngược + SP nổi bật 4 món + gói DV 3 thẻ + vì sao chọn (giao 1-2 ngày nội thành, HĐ VAT 2 ngày, QA 24h) + đánh giá KH + tin tức + app banner.
# - /san-pham: toolbar lọc (loại, giá, còn hàng) + tìm + sắp xếp + phân trang + skeleton; /san-pham/:slug: gallery ảnh, giá, badge, còn/hết hàng (KHÔNG số tồn), mô tả, số lượng + thêm giỏ, đánh giá, SP liên quan, breadcrumb + JSON-LD SEO.
# - /dich-vu + /dich-vu/:id: 3 thẻ DV + form đặt lịch/báo giá (tên, SĐT VN, slot_time tương lai, số người/địa điểm teabreak, MST nếu cần VAT) + xác nhận đã nhận.
# - Giỏ (localStorage, badge realtime) + /thanh-toan 1 trang (họ tên, SĐT, email, địa chỉ, ghi chú, pay_method COD/bank/ewallet, tóm tắt tiền, header Idempotency-Key tự sinh) → /xac-nhan-don (mã đơn + lookup_token + QR VietQR nếu bank + nút tra cứu).
# - Trang: /khuyen-mai, /tin-tuc, /chinh-sach/* (đổi trả 7 ngày, vận chuyển 1-2/2-4 ngày, bảo mật), /lien-he (8h-22h + fanpage/Zalo), 404 thân thiện. SEO: title/meta/OG/sitemap.xml/robots.

# 3. BACKEND (backend/src/public/):
# - POST /api/public/orders {name,phone,email,address,note,pay_method,items[{sku,qty}]}: validate SĐT/email VN + sanitize; khử trùng customers phone/email; giá lấy từ products.price (KHÔNG tin client); tx check tồn SUM(stock_moves), thiếu → 409; tính amount server; >=50tr → pending_approval đúng approval-matrix; gọi finance.createReceivable + supply.moveStock(out âm) + supply.createShipment + helpdesk.createTicket (link order_id); trả {order_code, lookup_token}; rate-limit chặt nhất; không lộ cost/tồn.
# - POST /api/public/service-requests {service_id,name,phone,slot_time,note,...}: validate SĐT + slot tương lai; lưu booking + ticket policy_inquiry/easy.
# - Design system: 1 màu chủ đạo + 1 màu nhấn (kiểu đỏ Viettel → nâu café), font hệ thống, spacing 8pt, card radius 12, button full-width mobile; loading/empty/error chuẩn.

# 4. TEST: public-orders.test.js (tạo đơn OK đúng status+receivable+shipment+ticket; hết tồn 409; SĐT sai 400; giá client bịa bị bỏ qua; idempotency deduped) + test UI tay (thêm giỏ → checkout → mã đơn). verify + test cũ PASS.

# 5. TRẢ LỜI: file đổi (kèm cây thư mục storefront/src) | lệnh chạy 4 services + ảnh chụp 5 màn hình chính | kết quả verify/test | quyết định. Kết thúc: "Chờ OK mới sang P3".
# 6. GIỚI HẠN: không tra cứu sâu/webhook/chat trong P2.
```
