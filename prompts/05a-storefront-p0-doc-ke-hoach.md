# PROMPT 05a v6.1 — STOREFRONT P0: đọc repo + báo cáo Viettel-gap + kế hoạch (CHƯA CODE)

> Precondition: repo BizOps AI v6.1 (backend :3000, frontend ERP :5173, agent_svc :3100) đang xanh verify. Prompt này CHỈ báo cáo, TUYỆT ĐỐI chưa ghi code.

```Prompt
# VAI TRÒ: Bạn là senior full-stack + UX researcher. Nhiệm vụ duy nhất là ĐỌC và LẬP KẾ HOẠCH cho website khách hàng chuẩn Viettel Telecom.

# 1. ĐỌC BẮT BUỘC (không bịa, trích dẫn file + dòng khi kết luận):
# - README.md, Mo_hinh_to_chuc_van_hanh_doanh_nghiep_100_nhan_vien.md (mục 6 Sales, 8 CSKH, 10 Kho/Logistics, 17 luồng Khách→Doanh thu).
# - docs/contract/: manifest.json (35 bảng), enums.json (order_status/pay_method/ticket_*), roles-permissions.json, approval-matrix.json v6.1, invariants.sql (I1/I1b/I2/I5/I6/I8), openapi.yaml, traceability.csv, table-ownership.json, state-machines.md.
# - backend/src/server.js, common/db.js (better-sqlite3/pg + tx()), common/auth.js (JWT httpOnly cookie + Bearer), common/security.js (helmet, CORS whitelist, apiLimiter/chatLimiter/loginLimiter), common/validate.js (reqStr/reqIntPos/reqCode), common/audit.js, db/migrate.js, scripts/verify.js.
# - routes/sales.js + modules/sales/service.js (createOrder: check tồn SUM(stock_moves), tính tiền server từ products.price, amount>=50tr → pending_approval, sinh receivable + shipment), modules/finance/service.js (createReceivable/recordPayment/setOrderPaid), modules/supply/service.js (moveStock + I2/I6), modules/helpdesk/service.js (createTicket TCK-*, SLA manifest.conventions.sla_hours).
# - agent_svc/src/routes/chat.js (x-agent-key), brain/cskh.js (rag top-3, guardReply chặn leak cost/lương/giảm giá/injection + [CẦN-DUYỆT], whitelist số), agent.js + skills/*.js (12 skills), knowledge/*.md (cskh/policy/shipping-promo).
# - backend/.env, agent_svc/.env (DATABASE_PATH=../data/bizops.db, AGENT_URL, AGENT_INTERNAL_KEY), frontend/vite.config.js (proxy /api → :3000).

# 2. CONTEXT DỰ ÁN (dùng trong toàn bộ phân tích):
# BizOps Café | F&B café/trà/bánh (mang đi + giao hàng + tại quán) | SP: CF-SUA-01 Cà phê sữa 35.000đ, TRA-DAO-01 Trà đào 40.000đ, BANH-01 Bánh ngọt 25.000đ, COMBO-SANG | DV: DV-TEABREAK teabreak văn phòng, DV-GIAO-TAN-NOI giao có mã vận đơn, DV-HOA-DON-VAT HĐ VAT (đặt lịch + báo giá) | Thanh toán COD + VietQR/bank + ví | TV, VND, Asia/Ho_Chi_Minh.

# 3. NHIỆM VỤ — CHỈ BÁO CÁO, 4 PHẦN:
# A) Tóm tắt ≤20 dòng: kiến trúc 3 services, luồng đơn Sale, approval-matrix, ownership, invariants tiền/kho, guardrail agent.
# B) Viettel-gap: đối chiếu vietteltelecom.vn (topbar hotline/cửa hàng/tra cứu, mega-menu, hero carousel + quick-action, lưới danh mục, flash-sale, listing lọc-tìm-sắp xếp, chi tiết SP nhiều ảnh + specs + đánh giá, giỏ/checkout 1 trang, tra cứu đơn, footer 4 cột, nút nổi) với cái repo ĐANG CÓ → liệt kê bảng: khối Viettel | repo đã có gì | còn thiếu | ánh xạ vào BizOps Café.
# C) Contract thiếu: products cần thêm (is_published/slug/description/images_json/badge/sort)? services + service_requests? customers cần email/address/contact_hash? order_lookup_tokens? pay_webhook_logs? tickets.order_id? orders.source/lookup_code? banners/promotions nếu muốn carousel/khuyến mãi kiểu Viettel? Mỗi mục: tên bảng-trường + lý do + ảnh hưởng invariants/ownership. KHÔNG sửa file.
# D) Kế hoạch 6 giai đoạn (file tạo/sửa, migration 002 sqlite+postgres, endpoint /api/public/*, contract cập nhật, test file, env mới, docker-compose) + 7 câu hỏi chặn: COMBO-SANG trừ kho theo thành phần hay SKU riêng? Giá cố định hay theo giờ/kênh, ai sửa? Teabreak cần ca/số người/địa điểm? VietQR tĩnh hay PayOS động, secret ai giữ? Domain prod storefront? Mã tra cứu BC-XXXXXX hay DHxxx+SĐT? Ticket đơn web gán team nào, SLA nào?

# 4. ĐỊNH DẠNG: A. Tóm tắt | B. Bảng Viettel-gap | C. Bảng thiếu contract + kế hoạch | D. Câu hỏi chặn. Kết thúc: "Chờ bạn gõ OK mới sang P1".
# 5. GIỚI HẠN: không tạo/sửa bất kỳ file code nào.
```
