# PROMPT 06b v6.1 — TELCO Phase 3-5: design system + component library + Header/Footer (nền kiểu Viettel, brand BizOps Café)

> Precondition: 06a đã OK (chốt sitemap + journeys + component list). Dựng nền UI, chưa làm Home/Catalog/Checkout.

```Prompt
# VAI TRÒ: Bạn là Design System Engineer + Senior Frontend (React + TypeScript strict + Tailwind + Framer Motion nhẹ).

# 1. STACK + KIẾN TRÚC (storefront/ mới, port 5174, deploy riêng, cấm phơi ERP :5173):
# src/{app/,components/{layout,navigation,product,service,promotion,checkout,lookup,support,common},pages/{home,san-pham,dich-vu,khuyen-mai,tim-kiem,so-sanh,gio,thanh-toan,tra-cuu,ho-tro},hooks/,services/ (axios gọi /api/public/*),store/ (zustand: cart/compare/favorites/search/filters),types/,utils/ (fmtVND vi-VN, norm không dấu, time VN),constants/,assets/}. TanStack Query cho products/services/promos (cache 60s khớp Cache-Control backend); Zustand cho cart/compare/fav; types Product {sku,slug,name,price,unit,badge,category,is_combo,description,images,stock:'in_stock'|'out_of_stock'} Service {id,code,name,type,price,unit,description} (KHÔNG cost/tồn số). Mock tách mockProducts/mockServices/mockPromotions/mockCategories để thay bằng API thật.
# CONTEXT: BizOps Café | 35k/40k/25k/55k combo | teabreak/giao/VAT | COD + VietQR tĩnh + ví | TV, VND, Asia/Ho_Chi_Minh.

# 2. DESIGN SYSTEM RIÊNG (nguyên bản, không copy Viettel):
# - Tokens: màu chủ đạo nâu café (#6F4E37) + nhấn cam (#E8762D, gợi flash-sale) + nền #FAF7F2 + chữ #1A2233; typography scale (display/home/section/card/body/caption, TV); spacing 8pt; radius 12 (card) / 999 (pill); shadow sm/md; breakpoints 360/375/390/430/768/1024/1280/1440, container ≤1200.
# - Components tái dùng (mỗi cái có variants + states default/hover/loading/disabled): Button (primary/ghost/danger/small), Input/Select/Textarea (label + error TV), Card (product/service/promo), Badge (bán-chạy/mới/flash-sale/hết-hàng), Tabs, Accordion (FAQ/chính sách), Breadcrumb, Pagination, Tooltip, Toast, Skeleton, Alert, Dropdown, Modal, Drawer (giỏ mobile + menu), CompareTray, Timeline (tra cứu đơn), QRBox (VietQR).
# - A11y từ đầu: semantic HTML, focus-visible, aria cho menu/drawer/modal/chat, contrast AA, label + error message tiếng Việt.

# 3. HEADER/FOOTER KIỂU TELCO (behavior như audit 06a):
# - Topbar: hotline, cửa hàng (giờ 8h-22h), tra cứu đơn, hỗ trợ. Header sticky: logo BizOps Café (tự vẽ, không logo Viettel), search không dấu (gợi ý + tìm kiếm gần đây + phổ biến), giỏ có badge realtime (zustand), nút chat. Mega-menu desktop (Cà phê/Trà/Bánh/Combo/Dịch vụ/Khuyến mãi/Tin tức, nhiều cột + hover/active) + Hamburger → Drawer mobile (menu + search + giỏ + hotline). Sticky khi scroll, ẩn bớt topbar ở mobile.
# - Footer 4 cột (về chúng tôi, hỗ trợ KH, chính sách đổi trả 7 ngày/vận chuyển 1-2/2-4 ngày/bảo mật, liên hệ + fanpage/Zalo) + thanh toán (COD/VietQR/ví) + copyright BizOps Café. Nút nổi: hotline, chat agent, Zalo, lên đầu trang.

# 4. TRẠNG THÁI CHUẨN (mọi component data-driven phải có): loading (skeleton) / empty (minh họa + CTA) / error (thử lại, không màn hình trắng) / success. Animation Framer Motion nhẹ (menu/drawer/modal/toast/accordion), không lạm dụng. Không hard-code UI 1 file, không iframe, không screenshot làm giao diện.

# 5. NGHIỆM THU: `npm run build` storefront PASS, 0 TypeScript error, 0 console error, demo Header/Footer responsive 360→1440 có ảnh chụp. Chưa gọi checkout/webhook (để 06d).
# 6. TRẢ LỜI: file đổi (kèm cây storefront/src) | lệnh build | kết quả | quyết định. Kết thúc: "Chờ OK mới sang 06c".
# 7. GIỚI HẠN: không Home/Catalog/Detail/Checkout ở 06b.
```
