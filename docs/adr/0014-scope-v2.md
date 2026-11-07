# ADR-0014: Scope v2 — phân quyền phòng ban server-side, fail-closed

Ngày: 2026-11-07 | Trạng thái: chấp nhận | Liên quan: Phase 3 (P0-5, P2-19)

## Bối cảnh

v8.0 có 2 lớp phân quyền tách biệt:

- **RBAC theo vai** (`roles-permissions.json` + `requirePerm`): user có được gọi
  API hay không.
- **Scope theo phòng ban**: gần như **không có** ở tầng server — chủ yếu ẩn tab
  ở UI và lọc ở một vài endpoint.

Kết quả: user hợp lệ (đúng vai) vẫn **đọc được dữ liệu của phòng ban khác** —
đây là rò dữ liệu chéo phòng ban (cross-tenant), không phải lỗi UI.

## Quyết định

1. **Scope là quyết định của SERVER**, không phải UI:
   - `resolveScope(user)` ⇒ `{ allDepts, depts, denied, dept, userDept }`.
   - `scopedList(conn, user, table, sql)` ⇒ tự động thêm `JOIN resource_dept` +
     `WHERE dept_code IN (...)`.
   - `assertBusinessScope(conn, user, table, id)` ⇒ 403 nếu bản ghi ngoài scope.
2. **Fail-closed** — 3 trường hợp trả **không có dữ liệu** (không phải "tất cả"):
   - user không có `employee_code` / không xác định được phòng ban ⇒ `denied=true`.
   - bản ghi chưa gán phòng ban trong `resource_dept` ⇒ 403.
   - `scopeFilter` với row không có `dept_code` ⇒ **loại bỏ** row đó.
3. **Cấp đọc đặc biệt**: vai có `scope_read='all'` (HR) được đọc toàn công ty —
   nhưng chỉ **đọc**; cột nhạy cảm (`employees.salary_base`) vẫn được lọc bằng
   `field_filter`.
4. **Middleware bắt buộc**: mọi route nghiệp vụ dùng `requireScoped(...)` thay vì
   `requirePerm(...)` đơn thuần. `verify.js` gate: route file không có
   `requireScoped`/`scopedList`/`assertBusinessScope` ⇒ FAIL.
5. **Endpoint đặc biệt được ghi ngoại lệ** (có lý do):
   - `GET /api/products` (catalog nội bộ, đọc toàn bộ là chính sách).
   - `GET /api/audit` — lọc theo `resource_dept` của chính bản ghi audit.
   - `GET /api/departments/overview` + `/api/agent/brief` — KPI tổng hợp theo vai,
     kèm `X-Scope-Depts` để audit.
6. **`X-Scope-Depts`** header trên mọi response overview/scope để kiểm toán
   ("user này nhìn thấy phòng ban nào").

## Hệ quả

- **Tích cực**: chặn được IDOR và rò dữ liệu chéo phòng ban ở tầng API, không
  phụ thuộc UI. `verify.js` + `tests/scope-v2.test.js` (sec01d..sec01k) chống hồi quy.
- **Chi phí**: mọi route phải đổi từ `requirePerm` sang `requireScoped`; mọi
  service tạo bản ghi phải gọi `setBusinessScope`.
- **Rủi ro**: dữ liệu không gán phòng ban ⇒ user hợp lệ bị 403 ⇒ cần backfill
  (migration 006) + quy trình vận hành để bảo đảm `setBusinessScope` luôn được gọi.

## Thay thế bị loại

- **Lọc ở UI**: API vẫn trả dữ liệu chéo phòng ban — không phải kiểm soát bảo mật.
- **Lọc sau khi đọc (`SELECT *` rồi filter trong JS)**: tốn băng thông, và dễ sót
  khi endpoint mới được thêm mà quên filter.
- **Fail-open** (row không có dept ⇒ coi như thuộc mọi phòng): vi phạm mục tiêu
  "không rò dữ liệu" — fail-closed là bắt buộc.
