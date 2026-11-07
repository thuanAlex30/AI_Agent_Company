# ADR-0016: Vòng đời credential + parity audit Agent (ENTERPRISE-AUTH-01, INV-2, P1-8)

Ngày: 2026-11-07 | Trạng thái: chấp nhận | Liên quan: SUPER PROMPT Enterprise Transformation (P0)

## Bối cảnh

Audit P0 phát hiện 3 gap chặn enterprise:

1. **Backend thiếu `change-password`**: user không tự đổi mật khẩu được; khi lộ mật khẩu không có cách thu hồi session ngay — access token cũ (`av` claim) vẫn sống tới 30p, refresh token cũ vẫn xoay vòng được.
2. **Agent lệch backend**: `agent_svc/src/db.js` thiếu type-parser PG (BIGINT trả string), thiếu `NO_ID_TABLES`/`insertedId`/`withForUpdate`, timezone dùng `toLocaleString` (lệch ngày UTC); `agent_svc/src/audit.js` cho phép `writeAudit(null,...)` + warn (mất audit im lặng).
3. **Fallback ID không xác định**: `helpdesk.js` (`addRating`) và `public.js` dùng `ORDER BY id DESC LIMIT 1` sau INSERT — 2 request đồng thời có thể gán audit/comment nhầm bản ghi.

## Quyết định

### 1. `POST /api/auth/change-password` (ENTERPRISE-AUTH-01)

- Input: `old_password` (bắt buộc, chống session cướp đổi pass) + `new_password` (policy: >= 8 ký tự, <= 128, có cả chữ + số, khác mật khẩu cũ).
- Trong CÙNG `db.tx`: `UPDATE users SET password_hash, auth_version+1` + `UPDATE refresh_tokens SET revoked, reason='password_change'` + `writeAudit(security.password_change)`.
- Xong: `clearCookie(access_token, refresh_token, csrf_token)` — FE bắt buộc login lại. Access token cũ chết NGAY do `av` mismatch (401), không chờ hết hạn.

### 2. Agent parity backend

- `db.js`: type-parser BIGINT/NUMERIC→Number, BOOL→boolean; `tzParts()` (Intl Asia/Ho_Chi_Minh) + `nowISO()` app-level; `withReturning()` giữ `RETURNING id` cho `ON CONFLICT DO NOTHING`, bỏ qua bảng `NO_ID_TABLES`; `withForUpdate()` (PG `FOR UPDATE`, SQLite no-op do TX-01 serialize); `insertedId()` fail-fast; SQLite `BEGIN IMMEDIATE`.
- `audit.js`: fail-closed — thiếu `conn.run` → throw `GOV 500 (INV-2)`, không warn.
- `helpdesk.js`: `createTicket`/`setTicket`/`addRating` nhận biết tx-conn qua `conn.lock`; gọi trực tiếp → bọc `db.tx` (ticket+rating+audit atomic); ID qua `insertedId()`; lookup theo `code UNIQUE` chỉ để phục hồi conflict; `setTicket` dùng `nowISO()`; `listSLA` so sánh `sla_due < nowISO()` (DB-01: không `CURRENT_TIMESTAMP` trong src).
- `public.js`: promo mới nhất `ORDER BY created_at DESC` (display, không phải fallback ID).

### 3. Contract-sync + test khóa hành vi

- `openapi.yaml` thêm `POST /api/auth/change-password`; `traceability.csv` thêm `SEC-11` (auth-password.test.js), `SEC-12` (agent-audit-parity.test.js), `PG-DB-REG` (dialect-regression).
- Đồng bộ 3 bản (`docs/`, `backend/docs/`, `agent_svc/docs/`) — verify `CONTRACT-SYNC` + CI `contract-sync` diff.
- `backend/tests/auth-password.test.js`: policy reject, đổi pass bump `auth_version` + revoke all + audit + login cũ fail/mới pass, sai old → 401, trùng old → 400.
- `agent_svc/tests/agent-audit-parity.test.js`: audit fail-closed, `insertedId`/`withReturning`/`withForUpdate`, quét src cấm fallback ID + hàm date DB, `createTicket`/`addRating` bọc `tx`.

### 4. Sửa verify bắt nhầm + dữ liệu test rò rỉ

- `verify.js`: parity bảng bỏ qua `*_new` (bảng tạm migration 007); check `qa/service` + trigger test loại comment trước khi regex (tránh bắt SQL trong comment giải thích bug).
- `dialect-regression pgr06`: cleanup phải `DELETE payment + expense` (ha trigger tạm), không chỉ reset `paid=0` — giữ invariant I1b `expenses.paid = SUM(payments)` cho `recon4`.

## Hệ quả

- **Tích cực**: lộ mật khẩu → thu hồi toàn bộ session ngay; audit không thể mất im lặng; ID luôn đúng bản ghi vừa tạo dưới concurrency; 3 bản contract không drift.
- **Chi phí**: đổi pass bắt login lại mọi thiết bị; mọi mutation agent phải qua `tx`; test tạo dữ liệu riêng phải tự dọn sạch (kẻo rò sang invariant test khác).
- **Rủi ro**: `auth_version+1` giết cả session hợp lệ khác — chấp nhận (an toàn > tiện). PG dev có dữ liệu PGR06 cũ phải dọn 1 lần bằng script hạ trigger tạm.

## Thay thế bị loại

- **Đổi pass không hỏi old_password**: session cướp đổi pass chủ sở hữu ra ngoài.
- **Audit warn ngoài tx**: mất audit im lặng, vi phạm INV-2.
- **Giữ fallback `ORDER BY id DESC`**: sai liên kết dưới tải đồng thời.
