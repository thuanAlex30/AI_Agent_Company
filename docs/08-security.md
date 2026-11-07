# 08 — Security v8.1 (tóm tắt, ma trận ở roles-permissions.json)

> Chi tiết quyết định thiết kế: `docs/adr/0012` (refresh session), `0013` (resource_dept),
> `0014` (scope v2), `0015` (state machine + tx + audit).

## 1. Xác thực & phiên (Phase 2)

- **Access token**: JWT, TTL **30 phút** (`ACCESS_TTL=30m`), ký HMAC bằng `JWT_SECRET`.
- **Refresh token**: TTL **7 ngày** (`REFRESH_DAYS=7`), chỉ lưu **hash SHA-256** trong
  `refresh_tokens.token_hash` — không lưu plaintext.
- **Xoay vòng nguyên tử**: `UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='rotated'
  WHERE id=? AND revoked IS NOT TRUE` — phải đổi **đúng 1 dòng** mới cấp token mới.
  2 request cùng lúc dùng cùng token ⇒ 1 thắng, 1 nhận 401.
- **Phát hiện tái sử dụng (reuse)**: token đã thu hồi mà vẫn được gửi ⇒ **thu hồi TOÀ BỘ
  phiên** của user (`revoked_reason='reuse'`). Thao tác này **cố ý chạy NGOÀI
  transaction** — nếu trong tx mà tx rollback thì lệnh thu hồi cũng biến mất.
- **Binding mềm**: UA khác hoàn toàn ⇒ reuse (thu hồi toàn bộ phiên); IP khác (NAT)
  ⇒ chỉ ghi cảnh báo, **không chặn**.
- **`auth_version`** trên `users`: tăng ⇒ mọi access token cũ vô hiệu (đổi mật khẩu).
- **Quản lý phiên**:
  - `GET /api/auth/sessions` — danh sách phiên đang mở (chỉ của chính user).
  - `DELETE /api/auth/sessions/:id` — thu hồi 1 phiên.
  - `POST /api/auth/logout-all` — thu hồi toàn bộ phiên.
- **Giới hạn phiên đồng thời**: `MAX_SESSIONS_PER_USER` (mặc định 5); vượt ⇒ thu hồi
  phiên cũ nhất (`revoked_reason='session_limit'`).
- **Cookie**:
  | Cookie | httpOnly | secure (prod) | sameSite | Mục đích |
  |---|---|---|---|---|
  | `access_token` | ✅ | ✅ | `COOKIE_SAMESITE` | phiên truy cập |
  | `refresh_token` | ✅ | ✅ | `COOKIE_SAMESITE` | xoay vòng |
  | `csrf_token` | ❌ (FE cần đọc) | ✅ | `COOKIE_SAMESITE` | CSRF double-submit |

## 2. CSRF (Phase 2 + Phase 5)

- **Double-submit cookie**: mọi mutation (`POST/PUT/PATCH/DELETE`) phải có
  header `X-CSRF-Token` **khớp** cookie `csrf_token` (so sánh **timing-safe**).
- **Ngoại lệ**: `GET/HEAD/OPTIONS`, `/api/public/*`, `/api/auth/login`, `/api/auth/refresh`,
  và mọi request mang `Authorization: Bearer` (không dùng cookie ⇒ CSRF không áp dụng).
- FE: `frontend/src/api.js` đọc cookie `csrf_token` và gửi header cho **mọi** request
  (kể cả `apiUpload` cho multipart).

## 3. Phân quyền 3 lớp

1. **RBAC theo vai** — `roles-permissions.json` + `requirePerm`. 14 vai.
   Lọc `salary_base` / `password_hash` **ở backend** (không chỉ ẩn UI).
2. **Scope theo phòng ban (server-side, fail-closed)** — xem ADR-0014.
   - `resource_dept` là nguồn sự thật duy nhất (ADR-0013).
   - Không xác định được phòng ban ⇒ **không thấy dữ liệu nào** (fail-closed).
   - Mọi route nghiệp vụ dùng `requireScoped`; `verify.js` gate bắt buộc.
   - Header `X-Scope-Depts` trả phạm vi hiện tại để kiểm toán.
3. **Cổng duyệt** — `approval-matrix.json` là nguồn sự thật:
   - Cấp duyệt **luôn tính từ matrix**, client **không được ép cấp** (`400`).
   - `requester ≠ decider` (kể cả CEO).
   - Cấp cao duyệt thay cấp thấp bị từ chối.
   - Contract ≥ ngưỡng cần thêm cấp bổ sung `legal` (`contract_extra_legal`).

## 4. Bất biến dữ liệu (Phase 4)

- **Audit trong cùng transaction** (INV-2): `writeAudit(conn, ...)` **ném lỗi 500** nếu
  thiếu `conn` ⇒ không thể có bản ghi mồ côi. `audit_log` **append-only** (trigger chặn
  UPDATE/DELETE trên cả 2 dialect).
- **State machine** (INV-8): `ORDER_FLOW` / `TICKET_FLOW` / `SHIP_FLOW` / `IT_FLOW`.
  Chuyển sai ⇒ `400`, không update lệch. Thanh toán đủ khi chưa giao xong ⇒ đi qua
  `partial` trước `paid`.
- **Khoá dòng trước khi ghi** (P1-9): `SELECT ... FOR UPDATE` cho orders/debts/
  approvals/products + conditional update (`changes === 1`, nếu không ⇒ `409`).
- **Không suy luận ID** (P1-8): cấm `ORDER BY id DESC LIMIT 1` sau INSERT ⇒ dùng
  `insertedId()`.
- **Tồn kho**: nguồn kiểm tra duy nhất là `supplyService.moveStock` trong transaction
  ⇒ không oversell. SKU sắp xếp alphabet trước khi trừ (tranh deadlock trên PG).

## 5. Hardening vận hành (Phase 6)

- `helmet` + CSP (cấm inline script, cấm JWT trong `localStorage`).
- **Rate-limit tách lớp**: `apiLimiter` (ERP, 300/15p/IP) · `publicLimiter` (storefront,
  bucket riêng) · `loginLimiter` (10/15p) + `loginUserLimiter` (theo user) ·
  `refreshLimiter` · `chatLimiter` (30/5p).
- **`trust proxy` theo topology** (`TRUST_PROXY`): `loopback` khi nginx cùng host,
  `1`/`2` theo số hop. **Không** hard-code `true`.
- **CSRF + cookie** xem mục 1–2.
- **Container**: user **không phải root**, `cap_drop: [ALL]`, `read_only: true`,
  `no-new-privileges:true`, `tmpfs: /tmp`.
- **Observability**: mọi dòng log có `[rid=...]` (request id); mọi quyết định **403**
  (RBAC và scope) đều được log kèm `user/role/dept/resource`.
- **`/api/ready`**: kiểm tra DB (bắt buộc) **và** agent (`checks.agent`); agent offline
  ⇒ trạng thái `degraded` (vẫn 200, không restart-loop backend).
- **`/api/health`**: liveness, trả `version` từ `config.APP_VERSION` (1 nguồn).
- Fail-fast secret ở production (`JWT_SECRET`, `AGENT_*_KEY`, `WEBHOOK_SECRET` ≥ 32 ký tự,
  2 key agent phải khác nhau); cấm seed và `x-user-code` ở prod.
- Backup `pg_dump`/`.backup` + restore test; nhắc nợ `reminder_log` 1 lần/ngày,
  khung 8h–20h giờ VN.
