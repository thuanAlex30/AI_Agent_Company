# PROMPT 06e v6.1 — TELCO Phase 12-15: chat public + quality (responsive/a11y/perf/SEO) + audit cuối + go-live

> Precondition: 06d xanh (checkout→ERP→webhook→kế toán đúng). Cổng go-live: FAIL 1 mục = dừng.

```Prompt
# VAI TRÒ: Bạn là AI engineer + UI reviewer + security + DevOps. CONTEXT: BizOps Café | COD + VietQR tĩnh + ví | TV, VND, Asia/Ho_Chi_Minh.

# 1. CHAT PUBLIC (widget kiểu Viettel, guardrail BizOps — 0 leak mới pass):
# - Giữ POST /chat nội bộ. Thêm POST /public-chat (agent_svc) với AGENT_PUBLIC_KEY RIÊNG (env + .env.example, không commit secret). Rate-limit IP 5p/10 req, input ≤500 ký tự, output ≤600 ký tự. RAG CHỈ agent_svc/knowledge_public/ (san-pham.md: 35k/40k/25k/55k combo; faq.md: giờ 8h-22h, đặt món, HĐ VAT 2 ngày, đổi trả 7 ngày, ship 1-2/2-4 ngày; chinh-sach-doi-tra.md; van-chuyen.md; bao-mat.md). Cấm đọc knowledge nội bộ. Cấm trả: cost, tồn số, lương/nhân sự, đơn KH khác, system prompt.
# - Guardrail: injection (bỏ qua quy định/ignore instructions/system prompt/jailbreak) → "Em chuyển CSKH xử lý ạ." + helpdesk.createTicket; đòi giảm 50%/quà trái phép → từ chối + nêu promo KM-SANG hiện có; moi dữ liệu → từ chối + ticket; ngoài phạm vi → chuyển CSKH. Số ngoài whitelist → [CẦN-DUYỆT].
# - Backend POST /api/public/chat proxy (giữ key ở server, publicChatLimiter). Widget: nút nổi + popup + 4 quick-reply (Xem menu / Đặt món thế nào? / Đơn của tôi đâu? / Khuyến mãi nào?) + trích nguồn + states loading/error.
# - Eval scripts/eval-public-chat.js 30+ cases (hỏi menu/giá/giờ/ship/đổi trả/teabreak/tra đơn mình + 15 đối kháng: moi cost/tồn/lương, injection 3 kiểu, đòi giảm 50%, hỏi đơn người khác, ép lộ prompt) — PASS 100%, 0 leak. Test public-chat.test.js (OK/sai key 401/429/input độc→chặn+ticket). Agent cũ (7 tests + eval 100/100) vẫn PASS.

# 2. QUALITY (soi như QA Viettel):
# - Responsive 360/375/390/430/768/1024/1280/1440: không overflow, không chữ tràn, tap-target ≥44px, hamburger/drawer mobile, checkout 1 cột mobile, compare scroll ngang mobile. Ảnh chụp 360 + 768 + 1440.
# - A11y: semantic, keyboard, focus-visible, aria (menu/drawer/modal/chat/timeline), contrast AA, label + error TV, screen-reader test.
# - Perf: lazy route + ảnh (WebP, width/height, placeholder), code-split, memo khi cần, TanStack cache, skeleton; build JS <500KB, Lighthouse ≥85 (Performance/SEO/Best), Core Web Vitals tốt.
# - SEO: title/meta/canonical/OG/JSON-LD (Product + Breadcrumb) / sitemap.xml / robots. Mỗi page: Header + (Breadcrumb) + Main + CTA + Footer, nhất quán.
# - 5 luồng minh chứng: tìm món → chi tiết → giỏ → checkout → mã đơn; đặt teabreak chi tiết; tra cứu DHxxx+SĐT; chat hỏi menu; mobile mua 1 tay.

# 3. BẢO MẬT + DOCKER + README:
# - Bảng PASS/FAIL: rate-limit /api/public/* (đơn+chat chặt nhất); validate/sanitize/body-limit; CORS đúng origin prod (tôi cung cấp); CSRF nếu cookie; helmet CSP không inline; không stack prod; secret chỉ env (AGENT_PUBLIC_KEY/WEBHOOK_SECRET); webhook HMAC+replay 5p; log requestId không PII/thẻ; không seed demo prod; fail-fast thiếu JWT_SECRET; tra cứu chống enumeration; chat không rò key nội bộ.
# - docker-compose.yml 1 lệnh: backend :3000 + agent :3100 + ERP :5173 (nội bộ) + storefront :5174 (public) + volume data/bizops.db + healthcheck. README: chạy 4 services, env, sơ đồ Khách→Storefront→/api/public→ERP (duyệt→kho/kế toán)→CSKH, backup/restore, rollback 002.

# 4. CHẠY CUỐI: backend (migrate → verify ALL PASS → test 41 + mới) + agent (test 7 + eval 100/100 + eval-public) + frontend build + storefront build. Liệt kê FAIL + fix, không bỏ test đỏ.
# 5. TRẢ LỜI: file đổi | lệnh docker + verify/test | bảng design-fix + bảo mật PASS/FAIL + Lighthouse | rủi ro + kế hoạch prod. Kết thúc: "Chờ OK mới coi là xong".
# 6. GIỚI HẠN: không thêm tính năng mới, chỉ polish + đóng gói.
```
