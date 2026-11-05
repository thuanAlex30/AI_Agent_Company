# ADR-0005: Mở rộng từ SME 7 ban/17 bảng lên ERP 100 người/12 khối

Ngày: 2026-11-05 | Đề xuất: Chủ dự án + Kiến trúc sư | Trạng thái: chấp nhận có điều kiện

## Bối cảnh
Docs gốc (00-vision, 03-brd): SME 10–100 người, 7 phòng ban, 17 bảng, P1 chỉ Sales+Kho+Kế toán.
File mô hình 100 nhân sự của chủ dự án: 12 khối (CEO Office, Sales 18, Marketing 7, CSKH 8, Ops 15, Mua-Kho-Logistics 8, Finance 7, HR-HC 7, IT 10, Legal/Control 4, QA 3, Product 5), kèm RACI, phê duyệt phân cấp, dashboard CEO 7 cụm.
Prompt v4 đã nhảy thẳng lên ERP ~31 bảng, vi phạm "hiến pháp" (mọi quyết định phải đối chiếu docs).

## Lựa chọn
- A. Quay lại SME 17 bảng (an toàn, nhưng vứt bỏ file 100 nhân sự).
- B. Giữ ERP 100 người, dựng cả 12 khối + AI một lượt (nhanh nhưng phá roadmap, nợ kỹ thuật).
- C. Giữ ERP 100 người nhưng chia phase đúng roadmap (được chọn).

## Quyết định
Chọn C:
1. Chuẩn scope mới: **12 khối, 12 departments** (gộp Mua+Kho+Logistics thành 1 code `supply` để khớp đúng 12 khối, phân biệt bằng `title`: Procurement/Warehouse/Logistics). Mọi tài liệu ghi "14 mã" trước đây là sai đánh máy → chuẩn hóa còn 12.
2. Tổng bảng chuẩn v5: **32 bảng chính + 1 legacy `inventory` = 33**. Mọi prompt/docs sau này phải ghi đúng con số này.
3. Lộ trình giữ nguyên tắc P0→P1→P2→P3: P1 chỉ Sales+Supply+Finance chạy thật; các khối khác ở P1 chỉ seed + API đọc, sang P2/P3 mới hoàn thiện write-path. Prompt tách nhỏ 02a–02d, 03a–03c để không dựng ồ ạt.
4. Bảo mật, migration, test, backup, RAG là bắt buộc (chi tiết trong các ADR-0006..0010 rút gọn ở dưới).

## Hệ quả
- Cập nhật 00-vision (scope 12 khối), 02-roadmap (phase lại), 03-brd (stakeholder 12 khối), 04-architecture (module supply gộp), 05-database, 06-api, 07-ai, 08-security, 09-testplan, 11-glossary (SLA high=4h).
- Prompt v5 thay v4, đánh số lại bảng, sửa mọi bug logic mục 2 của bản phản biện.

## Các ADR con kèm theo
- ADR-0006 Async-DB: better-sqlite3 (sync) ở dev, pg (async) ở prod → **viết service async/await ngay từ đầu**, adapter sync bọc `Promise.resolve()`. Ghi rõ "đổi Postgres vẫn refactor adapter, không đổi service".
- ADR-0007 Tiền INTEGER (đồng), thời gian TIMESTAMP, upsert dùng `ON CONFLICT DO NOTHING` (ANSI), không dùng `INSERT OR IGNORE` / `DATETIME`.
- ADR-0008 Biên module: sales không INSERT trực tiếp debts/shipments; phải gọi `finance.createReceivable()` + `supply.createShipment()`. Vi phạm = fail review.
- ADR-0009 Đối soát: bắt buộc khớp mã (order code hoặc KH code) + điểm tiền; hòa điểm → unmatched cho người duyệt; so với `remain` chứ không phải `amount`.
- ADR-0010 AI guardrail 2 lớp: system prompt + lọc code (regex giảm/tặng/cost/lương/>10tr) + chống prompt-injection (strip instruction trong text KH).
