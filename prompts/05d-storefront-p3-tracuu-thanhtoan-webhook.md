# PROMPT 05d v6.1 — STOREFRONT P3: tra cứu đơn + thanh toán + webhook → kế toán (chuẩn Viettel)

> Precondition: P2 xanh (checkout tạo đơn ERP đúng luồng). Làm sâu tiền + vận đơn như trang Viettel.

```Prompt
# VAI TRÒ: Bạn là backend engineer tiền + webhook + timeline đơn hàng. CONTEXT: BizOps Café — COD + VietQR/bank + ví (cash/bank/ewallet).

# 1. ĐỌC: modules/finance/service.js (recordPayment, setOrderPaid, I1 paid=SUM, I5 chống double), modules/sales/service.js (cancel/refund, ORDER_FLOW), modules/supply/service.js (SHIP_FLOW pending→shipping→done/failed), invariants.sql, common/security.js, common/audit.js.

# 2. TRA CỨU (GET /api/public/orders/:code trong backend/src/public/):
# - Xác thực 2 yếu tố: mã đơn + contact (hash khớp customers.phone/email) HOẶC header X-Lookup-Token (so token_hash, check expires_at). Chống dò quét: rate-limit IP chặt + delay đều ~300ms + trả chung 404 (không phân biệt sai mã/sai contact). Response chỉ: trạng thái + timeline (đã nhận → duyệt → làm món → giao → hoàn tất, map từ orders.status + shipments.status), remain (amount-paid), ship_fee/carrier (không tracking nội bộ nhạy cảm). Không lộ khách khác/cost/tồn.
# - Trang /tra-cuu-don kiểu Viettel (ô mã đơn + SĐT/email + nút tra cứu + kết quả timeline + nút đánh giá sao) + /xac-nhan-don (mã + token + QR VietQR nếu bank + hotline hỗ trợ). Đơn teabreak/HĐ VAT hiện bước "đã nhận → liên hệ báo giá" thay vì giao hàng.

# 3. WEBHOOK (POST /api/public/payments/webhook):
# - Verify HMAC-SHA256 (secret env, .env.example cập nhật, không commit secret), timestamp lệch ≤5 phút chống replay; lưu pay_webhook_logs (bank_ref UNIQUE, payload_hash) — trùng → {deduped:true}; gọi finance.recordPayment → sales.setOrderPaid (paid/partial, debts.paid đúng I1, không double I5); ghi audit; sai ký → 401, replay → deduped. Không log PAN/thẻ/PII rõ. Kèm curl + payload mẫu test tay. COD: đơn done khi kho/giao xác nhận, không cần webhook.

# 4. LIÊN THÔNG ERP: đơn paid hiện tab Kế toán/Sale, reconcile không match 2 lần, cancel/refund đúng ORDER_FLOW (có payment → refund không cancel).

# 5. TEST public-lookup-webhook.test.js: tra cứu đúng/sai contact/quét mã 429; webhook đúng/sai ký/replay/trùng/reconcile-double. verify + test PASS.

# 6. TRẢ LỜI: file đổi | lệnh + curl mẫu | kết quả | quyết định. Kết thúc: "Chờ OK mới sang P4".
# 7. GIỚI HẠN: không chat agent.
```
