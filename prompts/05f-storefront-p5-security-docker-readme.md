# PROMPT 05f v6.1 — STOREFRONT P5: design polish chuẩn Viettel + bảo mật + docker + README (cổng go-live)

> Precondition: P4 xanh (0 leak). FAIL 1 mục = dừng, không deploy.

```Prompt
# VAI TRÒ: Bạn là 3 người: UI reviewer (chuẩn Viettel) + security reviewer + DevOps. CONTEXT: BizOps Café — COD + VietQR/bank + ví.

# 1. DESIGN POLISH (soi như QA Viettel, liệt kê từng lỗi + fix):
# - Đồng nhất: header/topbar/menu/footer/nút nổi 100% trang; màu chủ đạo + nhấn dùng đúng token; font-size/line-height theo scale; spacing 8pt; card radius 12; ảnh SP cùng tỉ lệ, có placeholder + lazy; hero carousel chạy mobile + desktop, alt đầy đủ.
# - Responsive: 360px (menu hamburger, quick-action 2x2, checkout 1 cột, nút nổi gọn) → 768px → 1440px (container ≤1200, hero 2 cột). Không vỡ layout, không chữ tràn, tap-target ≥44px.
# - Hiệu năng/SEO/a11y: build <500KB JS, ảnh WebP + width/height, Lighthouse ≥85 (Performance/SEO/Best), title/meta/OG/sitemap/robots/JSON-LD, contrast AA, focus-visible, alt + aria cho nút nổi/chat.
# - Chạy thử 5 luồng Viettel: tìm món → chi tiết → giỏ → checkout → mã đơn; đặt teabreak; tra cứu đơn; chat hỏi menu; mobile mua 1 tay. Ghi video/ảnh minh chứng.

# 2. BẢO MẬT (bảng PASS/FAIL từng mục): rate-limit /api/public/* (đơn + chat chặt nhất); validate/sanitize/body-limit; CORS đúng origin prod (tôi cung cấp); CSRF nếu cookie; helmet CSP không inline; không stack prod; secret chỉ env (AGENT_PUBLIC_KEY/WEBHOOK_SECRET/PAYOS_*, .env.example đủ, không commit secret); webhook HMAC + replay 5p; log requestId không PII/thẻ; không seed demo prod; production fail-fast thiếu JWT_SECRET; tra cứu chống enumeration; chat public không rò key nội bộ.

# 3. DOCKER + README: docker-compose.yml 1 lệnh (backend :3000 + agent :3100 + ERP :5173 nội bộ + storefront :5174 public + volume data/bizops.db), healthcheck (/api/health, /health), lệnh build/up/logs/down. README: cách chạy 4 services, env, sơ đồ Khách→Storefront→/api/public→ERP (duyệt→kho/kế toán)→CSKH, backup/restore (.backup + pg_dump), rollback 002.

# 4. CHẠY CUỐI: backend (migrate → verify ALL PASS → test 35) + agent (test 7 + eval 100/100 + eval-public) + frontend build + storefront build. Liệt kê FAIL + fix, không bỏ test đỏ.

# 5. TRẢ LỜI: file đổi | lệnh docker + verify/test | bảng design-fix + bảng bảo mật PASS/FAIL + điểm Lighthouse | rủi ro + kế hoạch prod. Kết thúc: "Chờ OK mới coi là xong".
# 6. GIỚI HẠN: không thêm tính năng mới, chỉ polish + đóng gói.
```
