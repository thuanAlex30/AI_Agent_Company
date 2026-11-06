# PROMPT 06a v6.1 — TELCO Phase 1-2: audit viettel.vn/vx + Information Architecture BizOps Café (CHƯA CODE)

> Precondition: P1 xanh (migration 002 + 6 endpoint đọc public). Prompt này CHỈ audit + IA, chưa ghi code.

```Prompt
# VAI TRÒ: Bạn là UX researcher + senior frontend. Audit site tham chiếu rồi thiết kế IA cho BizOps Café.

# 1. AUDIT https://viettel.vn/vx/ (trung thực, không bịa):
# - Thử truy cập và ghi rõ từng khối: Header (logo/menu/mega-menu/search/account/cart), Hero/banner, danh mục (mobile/data/sim/esim/internet/tv/camera/devices), product cards, package cards, search/filter/sort, product detail, compare, cart/checkout, login/account/OTP, promotions, support/footer.
# - Với mỗi khối: trạng thái (xem được / bị chặn / không tồn tại) + UX pattern rút ra (layout, behavior, hierarchy) + KHÔNG sao chép logo/trademark/ảnh/nội dung có bản quyền, KHÔNG iframe, KHÔNG screenshot làm UI.
# - Nếu không truy cập được: ghi "KHÔNG TRUY CẬP ĐƯỢC — dùng phương án tương đương" rồi đề xuất tương đương.
# - Xuất 20 mục kiểm tra: IA, navigation hierarchy, user journeys, component hierarchy, layout, typography, spacing, card, button, form, modal/drawer, responsive, loading/empty/error/success, sticky, hover, scroll, mobile nav.

# 2. INFORMATION ARCHITECTURE BizOps Café (map telecom → F&B):
# - Sitemap: / (home) | /san-pham (catalog, thay /mobile/data/sim/esim) | /san-pham/:slug (detail) | /dich-vu (thay /internet/tv/camera) | /dich-vu/:id | /khuyen-mai + /tin-tuc (thay /promotions) | /tim-kiem | /so-sanh (compare ≤3 món) | /gio (cart) | /thanh-toan (checkout) | /xac-nhan-don | /tra-cuu-don (THAY login/account/orders/services/payments) | /ho-tro (thay /support) | /chinh-sach/* | /lien-he.
# - Navigation hierarchy: Topbar (hotline, cửa hàng, tra cứu, hỗ trợ) → Header sticky (logo BizOps Café, search, giỏ badge) → Mega-menu (Cà phê / Trà / Bánh / Combo / Dịch vụ / Khuyến mãi / Tin tức) → Footer 4 cột + nút nổi (hotline, chat, Zalo, lên đầu).
# - User journeys (3 luồng chính): (i) tìm món → chi tiết → giỏ → checkout COD/VietQR → mã đơn; (ii) đặt teabreak (form chi tiết: ca/số người/địa điểm/MST) → báo giá; (iii) tra cứu đơn (mã DHxxx + SĐT) → timeline → đánh giá sao.
# - CONTEXT: BizOps Café | CF-SUA-01 35k, TRA-DAO-01 40k, BANH-01 25k, COMBO-SANG 55k (trừ kho thành phần) | DV teabreak/giao/VAT | COD + VietQR tĩnh + ví | TV, VND, Asia/Ho_Chi_Minh.

# 3. RÀNG BUỘC HỆ THỐNG (IA phải khớp, không vẽ tự do):
# - Catalog đọc từ GET /api/public/products|services|banners|promotions (published only, stock in/out, giá server resolvePrice theo giờ/kênh, không cost/tồn số). Checkout POST /api/public/orders (Idempotency-Key). Tra cứu GET /api/public/orders/:code (2 yếu tố). Webhook VietQR HMAC. Chat POST /api/public/chat (AGENT_PUBLIC_KEY, knowledge_public).
# - ERP :5173 cấm public. Storefront :5174 public. Tiền BIGINT, UTC→VN.

# 4. TRẢ LỜI: A. Bảng audit (khối | trạng thái | pattern tái dùng) | B. Sitemap + navigation tree | C. 3 user journeys (từng bước + API gọi) | D. Danh sách component dự kiến (Header, MegaMenu, Hero, QuickAction, ProductCard, PackageCard→ComboCard, FilterBar, CompareTable, CartDrawer, CheckoutForm, LookupForm, Timeline, ChatWidget, Footer...). Kết thúc: "Chờ OK mới sang 06b".
# 5. GIỚI HẠN: không code, không sửa backend.
```
