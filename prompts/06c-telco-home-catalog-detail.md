# PROMPT 06c v6.1 — TELCO Phase 6-9: Home + Catalog + Detail + Search/Filter/Sort + Compare

> Precondition: 06b xanh (design system + Header/Footer build PASS). Làm discovery + mua hàng kiểu Viettel, nối API public P1.

```Prompt
# VAI TRÒ: Bạn là Senior Frontend (catalog + discovery). CONTEXT: BizOps Café | CF-SUA-01 35k, TRA-DAO-01 40k, BANH-01 25k, COMBO-SANG 55k (trừ kho thành phần) | DV teabreak/giao/VAT | COD + VietQR tĩnh + ví | TV, VND, Asia/Ho_Chi_Minh. API: GET /api/public/products|services|banners|promotions (TanStack Query, cache 60s).

# 1. HOME (/): Hero carousel 3 banner (từ /banners: hero-combo-sang, hero-teabreak + 1) + 4 quick-action (Đặt món / Đặt teabreak / Tra cứu đơn / Khuyến mãi) + lưới danh mục (Cà phê/Trà/Bánh/Combo/Dịch vụ) + flash-sale COMBO-SANG đếm ngược (giá server resolvePrice, KHÔNG tính client) + SP nổi bật 4 món (ProductCard: ảnh, tên, giá, badge bán-chạy/mới/flash-sale, stock in/out KHÔNG số tồn, CTA thêm giỏ + yêu thích) + gói DV 3 thẻ (ServiceCard → /dich-vu/:id) + vì sao chọn (giao 1-2/2-4 ngày, HĐ VAT 2 ngày, QA 24h) + đánh giá KH + tin tức + hỗ trợ/CSKH + Footer. Hero có heading/description/CTA + CTA phụ + responsive 2 cột → 1 cột mobile. Mỗi khối có loading skeleton / empty / error.

# 2. CATALOG (/san-pham): toolbar lọc (loại cafe/tra/banh/combo, khoảng giá, còn hàng) + tìm không dấu (utils norm, gợi ý + gần đây + phổ biến) + sort (nổi bật/giá tăng/giảm/mới) + phân trang (page/limit + meta backend) + skeleton + empty (gợi ý món khác) + error (thử lại). Filter state vào Zustand (filters) + URL search params (SEO/share được). /dich-vu tương tự cho 3 DV (lọc theo type teabreak/delivery/vat).

# 3. DETAIL (/san-pham/:slug): breadcrumb + gallery ảnh (+ placeholder/lazy, tỉ lệ đồng nhất) + tên/giá (server, kèm rule giờ nếu có) + badge + còn/hết hàng + mô tả + số lượng + thêm giỏ (CTA states default/hover/loading/disabled khi hết hàng/success) + combo_items nếu COMBO-SANG (liệt kê thành phần CF + BANH) + đánh giá (ratings) + SP liên quan + JSON-LD SEO + OG. /dich-vu/:id: mô tả + giá + form đặt lịch/báo giá (tên, SĐT VN, slot_time tương lai, party_size/location/teax_code MST nếu VAT, note) → POST /api/public/service-requests → xác nhận đã nhận + ticket CSKH.

# 4. SEARCH (/tim-kiem?q=...): suggestion dropdown (sản phẩm + dịch vụ + danh mục), recent + popular, no-result state (gợi ý từ khóa + món bán chạy). COMPARE (/so-sanh): chọn ≤3 món (CompareTray + Zustand compare), bảng so sánh (giá, loại, badge, còn hàng, mô tả) desktop table / mobile horizontal-scroll, nút thêm giỏ từng món + xóa.

# 5. RÀNG BUỘC: không lộ cost/tồn số/lương; giá hiển thị = giá server; ảnh /img/* placeholder nếu chưa có ảnh thật; responsive 360→1440 không overflow, tap-target ≥44px; a11y (breadcrumb nav, aria cho filter/compare); Framer Motion nhẹ (card hover, accordion FAQ, page transition).
# 6. NGHIỆM THU: build PASS, 0 TS error, luồng tìm → chi tiết → thêm giỏ chạy với API thật, ảnh chụp 5 màn hình.
# 7. TRẢ LỜI: file đổi | lệnh chạy (storefront :5174 + backend :3000) | kết quả | quyết định. Kết thúc: "Chờ OK mới sang 06d".
# 8. GIỚI HẠN: không cart/checkout/lookup/webhook/chat ở 06c.
```
