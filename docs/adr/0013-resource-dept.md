# ADR-0013: `resource_dept` — bảng danh mục phòng ban cho mọi tài nguyên

Ngày: 2026-11-07 | Trạng thái: chấp nhận | Liên quan: Phase 3 (P0-3, P0-4)

## Bối cảnh

Phân quyền theo phòng ban ban đầu dựa vào **cột `dept_code` có sẵn trên bảng**
(`orders`, `employees`, `budgets`, `sop_tasks`, …). Vấn đề:

- Bảng **không có `dept_code`** (`shipments`, `tickets`, `qa_checks`, `debts`,
  `payments`, `approvals`, `campaigns`, …) ⇒ **không lọc được** ⇒ rò dữ liệu
  chéo phòng ban.
- Nhân bản `dept_code` vào mọi bảng ⇒ **lệch dữ liệu**: một ticket của KH ở
  phòng sales mà ticket lại ghi `dept_code='cskh'` ⇒ đối chiếu không khớp.
- IDOR: đổi `id` trong URL để đọc đơn của phòng ban khác — không có chặn.

## Quyết định

1. Thêm **bảng danh mục** `resource_dept`:
   ```sql
   CREATE TABLE resource_dept (
     table_name   TEXT NOT NULL,
     record_id    BIGINT NOT NULL,
     dept_code    TEXT NOT NULL,
     owner_employee_id BIGINT NULL,
     PRIMARY KEY (table_name, record_id)
   );
   ```
   Bảng này là **nguồn sự thật duy nhất** cho "bản ghi này thuộc phòng ban nào".
2. `resource_dept` có **cột `dept_code` KHÔNG NULL** ⇒ không có "chưa gán" ⇒
   dữ liệu luôn fail-closed.
3. Bảng có sẵn `dept_code` thì `RESOURCE_DEPT` (`src/common/scope.js`) map sang cột
   đó; bảng không có thì dùng `resource_dept`.
4. **Mọi ghi** trong service phải gọi `setBusinessScope(conn, table, id, dept)` —
   **trong cùng transaction** với dữ liệu nghiệp vụ.
5. **Mọi đọc theo id** phải gọi `assertBusinessScope(conn, user, table, id)` ⇒
   403 nếu bản ghi thuộc phòng ban khác hoặc **chưa được gán** (fail-closed).
6. `migration 006_backfill_dept_scope` gán phòng ban cho **toàn bộ dữ liệu legacy**
   (suy ra từ quan hệ: `shipments.order_id → orders`, `debts.order_id → orders`,
   `approvals.ref_id → target`, …).
7. `X-Scope-Depts` header trả về phạm vi hiện tại ⇒ audit được "nhìn thấy gì".

## Hệ quả

- **Tích cực**: một cơ chế duy nhất cho mọi bảng; IDOR bị chặn ở server-side;
  không còn phụ thuộc vào việc mỗi bảng "có cột `dept_code` hay không".
- **Chi phí**: mỗi lần tạo bản ghi phải gọi thêm `setBusinessScope` (1 INSERT).
  Đây là lý do `writeAudit` + `setBusinessScope` phải cùng transaction.
- **Rủi ro**: bản ghi tạo trước migration 006 mà backfill không suy ra được ⇒
  bị 403 (fail-closed) ⇒ cần backfill thủ công. Đã xử lý bằng migration 006.

## Thay thế bị loại

- **Thêm `dept_code` vào mọi bảng**: nhân bản nguồn sự thật, dễ lệch, migration nặng.
- **Chỉ lọc ở UI**: bản thân API vẫn rò dữ liệu — không phải kiểm soát bảo mật.
- **Lọc theo `owner_employee_id`**: không phủ được tài nguyên dùng chung
  (ticket của KH, shipment của đơn).
