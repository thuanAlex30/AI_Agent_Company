# PROMPT 05b v6.1 — STOREFRONT P1: contract + migration + API public chỉ-đọc (nền catalog kiểu Viettel)

> Precondition: P0 đã OK (chốt Viettel-gap + contract thiếu). Chỉ làm nền đọc. Không UI, giỏ, checkout.

```Prompt
# VAI TRÒ: Bạn là backend engineer giữ kỷ luật contract BizOps v6.1, đồng thời dọn nền dữ liệu cho catalog kiểu Viettel (listing + lọc + banner + khuyến mãi).

# 1. ĐỌC LẠI: docs/contract/{manifest,enums,table-ownership}.json, backend/src/common/{db,validate,security}.js, scripts/verify.js. CONTEXT: BizOps Café — CF-SUA-01 35k, TRA-DAO-01 40k, BANH-01 25k, COMBO-SANG; DV teabreak/giao/HĐ VAT; COD + VietQR/bank + ví.

# 2. RÀNG BUỘC CỨNG (vi phạm = fail):
# - BIGINT VND, UTC→Asia/Ho_Chi_Minh, 1 lớp DB + tx(), không UPDATE chéo module (sales qua finance.createReceivable/supply.moveStock/createShipment; finance qua sales.setOrderPaid).
# - Schema mới DUY NHẤT qua backend/src/db/migrations/002_storefront.sql + 002_storefront.postgres.sql (migrate 2 dialect OK, ON CONFLICT DO NOTHING, cấm INSERT OR IGNORE/PRAGMA/DATETIME/GLOB).
# - Namespace backend/src/public/ riêng, KHÔNG authenticate/requirePerm NV; CORS chỉ ORIGIN_STOREFRONT; rate-limit IP riêng chặt hơn apiLimiter; validate reqStr/reqIntPos/reqCode + sanitize + body-limit nhỏ; không lộ stack/cost/tồn số/lương.
# - Cập nhật docs/contract/openapi.yaml + manifest.json + traceability.csv + table-ownership.json. npm run verify + npm test PASS.

# 3. NHIỆM VỤ:
# a) SQL duyệt trước ghi file — migration 002 gồm: (i) products thêm is_published/slug/description/images_json/badge/sort_order (giữ price/cost cũ, cost KHÔNG bao giờ public); (ii) services + service_requests (service_id, customer_id, slot_time, type booking/quote, status, note); (iii) customers thêm email/address/contact_hash (khử trùng phone/email kiểu convertLead); (iv) order_lookup_tokens (order_id, token_hash, expires_at); (v) pay_webhook_logs (provider, bank_ref UNIQUE, payload_hash, signature_ok); (vi) tickets.order_id nullable + orders.source ('erp'/'storefront') + lookup_code; (vii) banners (slug, image, link, sort, is_active) + promotions (code, title, desc, start/end, is_active) để chạy hero carousel + flash-sale kiểu Viettel — nếu P0 chốt KHÔNG cần thì ghi rõ lý do loại.
# b) Endpoint đọc: GET /api/public/products (page/limit/search không dấu qua norm(), filter category, sort giá/mới, chỉ is_published=1, tồn trả in_stock/out_of_stock + badge, KHÔNG số tồn), GET /api/public/products/:slug, GET /api/public/services + /:id, GET /api/public/banners, GET /api/public/promotions. Chuẩn response {ok,data,meta} + ETag/cache 60s.
# c) Test backend/tests/public-read.test.js: thành công, sai param 400, slug ẩn 404, CORS sai origin chặn, vượt rate-limit 429, assert không rò cost/tồn số.
# d) Seed demo ÁP DỤNG ĐÚNG 4 SP + 3 DV + 2 banner + 1 promo của BizOps Café (giá đúng 35k/40k/25k), chỉ dev.

# 4. TRẢ LỜI: file đổi | lệnh (migrate/verify/test + curl mẫu từng endpoint) | kết quả | quyết định cần chốt. Kết thúc: "Chờ OK mới sang P2".
# 5. GIỚI HẠN: không giỏ/checkout/webhook/chat.
```
