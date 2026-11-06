# PROMPT 06d v6.1 — TELCO Phase 10-11: Cart → Checkout → Lookup (thay Account) + COD/VietQR + webhook

> Precondition: 06c xanh (Home/Catalog/Detail/Compare chạy API thật). Làm tiền + đơn kiểu Viettel nhưng thay login/account bằng tra cứu không đăng nhập.

```Prompt
# VAI TRÒ: Bạn là team frontend + backend (checkout + tiền). CONTEXT: BizOps Café | COD + VietQR tĩnh + ví (cash/bank/ewallet) | TV, VND, Asia/Ho_Chi_Minh. BACKEND :3000, ERP :5173 cấm public, STOREFRONT :5174.

# 1. BACKEND (backend/src/public/, đã có catalog P1 — giờ thêm write):
# - POST /api/public/orders {name,phone,email,address,note,pay_method,items[{sku,qty}], header Idempotency-Key}: validate SĐT/email VN (common/validate.js + sanitize, body ≤100kb); khử trùng customers theo phone/email (như convertLead, lưu contact_hash); EXPLODE combo: COMBO-SANG → product_combos (1 CF + 1 BANH) rồi check tồn SUM(stock_moves) từng SKU con trong tx, thiếu → 409; giá lấy từ products.price + product_prices.resolvePrice(channel='web') (KHÔNG tin giá client); amount>=50tr → pending_approval đúng approval-matrix; gọi finance.createReceivable + supply.moveStock(out âm từng SKU con + cha ghi ref) + supply.createShipment + helpdesk.createTicket (order_id link); tạo order_lookup_tokens (token_hash, hết hạn 30 ngày); trả {order_code, lookup_token}; publicOrderLimiter (30/15p); không lộ cost/tồn số.
# - POST /api/public/service-requests (đã nêu ở 06c — hoàn thiện ở đây): validate SĐT + slot_time tương lai + party_size>0 + location + tax_code MST 10/13 số nếu DV VAT; lưu + ticket policy_inquiry/easy.
# - GET /api/public/orders/:code?contact=... (tra cứu 2 yếu tố: mã DHxxx + SĐT/email hash, HOẶC header X-Lookup-Token): publicLookupLimiter (60/15p) + delay đều ~300ms + trả chung 404 chống enumeration; chỉ trả status + timeline (đã nhận→duyệt→làm món→giao→hoàn tất, map orders.status + shipments.status) + remain + ship_fee/carrier (không tracking nhạy cảm).
# - POST /api/public/payments/webhook (VietQR tĩnh): verify HMAC-SHA256 (WEBHOOK_SECRET env, .env.example cập nhật, không commit secret), timestamp ≤5 phút, lưu pay_webhook_logs (bank_ref UNIQUE → trùng deduped), gọi finance.recordPayment → sales.setOrderPaid (paid/partial, đúng I1/I5), ghi audit; sai ký 401. COD: done khi kho/giao xác nhận, không cần webhook. Kèm curl + payload mẫu test tay.

# 2. FRONTEND (storefront/):
# - CART (/gio): CartDrawer (mobile) + page (desktop), Zustand cart (sku/qty, giá hiển thị từ server, không tin giá localStorage), sửa/xóa số lượng, tóm tắt tiền, CTA → /thanh-toan. Empty (minh họa + CTA xem menu) / error states.
# - CHECKOUT (/thanh-toan 1 trang): form (họ tên, SĐT, email, địa chỉ, ghi chú, pay_method COD/bank/ewallet radio + mô tả), tóm tắt đơn (giá server), Idempotency-Key tự sinh (uuid), states loading/failed/retry; thành công → /xac-nhan-don (mã đơn + lookup_token + QR VietQR nếu bank + nút tra cứu + hotline).
# - LOOKUP (/tra-cuu-don, THAY toàn bộ login/register/OTP/account/orders/services/payments của bản telecom): form mã đơn + SĐT/email → timeline + remain + nút đánh giá sao (POST /api/ratings qua public? nếu chưa có thì tạo endpoint public ratings giới hạn) + nút chat hỗ trợ. /ho-tro: FAQ accordion + form tạo ticket + hotline/fanpage/Zalo. /khuyen-mai, /tin-tuc, /chinh-sach/* (đổi trả 7 ngày, ship 1-2/2-4 ngày, bảo mật), /lien-he (8h-22h).
# - Payment UI: COD (xác nhận) / VietQR (QR + nội dung CK mã đơn) / ví (hướng dẫn), trạng thái pending/success/failed rõ ràng.

# 3. TEST: backend/tests/public-orders-lookup-webhook.test.js (tạo đơn OK đúng status+receivable+shipment+ticket; combo trừ kho con; giá bịa bị bỏ qua; hết tồn 409; SĐT sai 400; idempotency deduped; tra cứu đúng/sai contact/quét 429; webhook đúng/sai ký/replay/trùng; reconcile không double). verify + 41 tests cũ PASS.
# 4. TRẢ LỜI: file đổi | lệnh (migrate/verify/test + curl webhook) | kết quả | quyết định. Kết thúc: "Chờ OK mới sang 06e".
# 5. GIỚI HẠN: không chat agent ở 06d.
```
