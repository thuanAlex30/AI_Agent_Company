# SIÊU PROMPT — BizOps AI v8.1 "ENTERPRISE HARDENING"

> **Mục đích:** Đưa toàn bộ hệ thống BizOps AI từ trạng thái "demo ổn định trên SQLite" lên **production-grade chạy được trên PostgreSQL**, với **refresh-token vòng xoay chuẩn OIDC-lite**, **phân quyền theo phòng ban thực thi ở server (không chỉ ở UI)**, và **100% nghiệp vụ đúng trạng thái–tiền–kho–công nợ–duyệt**.
>
> **Cách dùng:** Copy nguyên văn prompt này vào 1 phiên Cursor Agent mới, làm việc **theo thứ tự Phase 0 → Phase 7**, mỗi Phase phải **test xanh trước khi sang Phase sau**.

---

## 0. BỐI CẢNH & NGUYÊN TẮC BẤT DI BẤT DỊCH

### 0.1. Kho mã hiện tại

| Thư mục | Vai trò | Công nghệ |
|---|---|---|
| `backend/` | API ERP (O2C, P2P, Finance, HR, Helpdesk, Governance, Public Storefront API) | Node 20+, Express 4, CommonJS |
| `agent_svc/` | Agent AI (rule-engine + RAG + guardrail) | Node 20+, Express |
| `frontend/` | ERP SPA (React + Vite) | React 18, Vite |
| `storefront/` | Cửa hàng web công khai (React + Vite) | React 18, Vite |
| `docs/contract/` + `backend/docs/contract/` | Contract: `manifest.json`, `roles-permissions.json`, `approval-matrix.json`, `table-ownership.json`, `enums.json`, `invariants.sql`, `state-machines.md`, `openapi.yaml`, `traceability.csv` | JSON/YAML/CSV |
| `scripts/` | Tooling dùng chung (`audit-pg-fk.cjs`, `fix-pg-fk-order.cjs`, …) | Node |

### 0.2. Bố cảnh DB — **2 dialect phải giữ đồng bộ tuyệt đối**

- `backend/src/db/migrations/001_init.sql` (SQLite) ↔ `001_init.postgres.sql` (PostgreSQL 15)
- `backend/src/db/migrations/002_storefront.sql` ↔ `002_storefront.postgres.sql`
- Adapter: `backend/src/common/db.js` — tự chuyển `?` → `$n`, tự `RETURNING id`, tự `FOR UPDATE`, tự ép Boolean `TRUE/FALSE` ↔ `1/0`.
- **Luật:** mọi thay đổi schema phải sửa **cả 2 file** + thêm assert trong `backend/scripts/verify.js` rằng 2 file có **cùng số bảng & cùng tập cột** (trừ khác biệt kiểu khai báo đã whitelist).

### 0.3. 10 bất biến **không được phá** (mọi Phase sau phải giữ)

- **INV-1 (Ownership):** Mỗi bảng có đúng 1 module sở hữu. `backend/src/public/**` **chỉ SELECT**; mọi write đi qua service sở hữu. Nguồn: `backend/docs/contract/table-ownership.json`.
- **INV-2 (Audit atomic):** Mọi mutation nghiệp vụ **ghi audit trong CÙNG transaction** với dữ liệu. `writeAudit(conn, …)` — nếu không truyền `conn` thì `common/audit.js` phải **throw** (không được chỉ `logger.warn`).
- **INV-3 (Append-only):** `stock_moves`, `payments`, `audit_log` **không UPDATE/DELETE** (trigger ở cả 2 dialect). Muốn điều chỉnh → ghi dòng mới + dòng bù trừ.
- **INV-4 (Money là BIGINT, không float):** Mọi tiền tệ là số nguyên **đồng**. Cấm `float`, cấm làm tròn âm thầm. Khi hiển thị mới format.
- **INV-5 (Thời gian VN):** Mọi mốc nghiệp vụ tính theo **Asia/Ho_Chi_Minh**. **Cấm** `new Date().toISOString().slice(0,10)` để lấy ngày (lệch 1 ngày trong 00:00–07:00 VN). Dùng `businessDayVN()` / `todayVN()` của `common/db.js` — và **sửa lại** chính hàm đó (Phase 1).
- **INV-6 (Single source of truth):** Số bảng, quyền, ngưỡng duyệt, enum **chỉ lấy từ `docs/contract/*.json`**. Code **không hardcode** ma trừ ngưỡng duyệt được phép đọc từ `approval-matrix.json`.
- **INV-7 (Idempotency):** Mọi `POST` tạo tiền/kho/đơn nhận `Idempotency-Key`; retry trả về **bản ghi cũ** (`deduped:true`), không tạo trùng.
- **INV-8 (State machine):** Mọi chuyển trạng thái đi qua bảng transition. Nguồn: `docs/contract/state-machines.md`. Chuyển sai ⇒ `400 VALIDATION`, **không** update lệch.
- **INV-9 (Scope server-side):** Quyền đọc/ghi được kiểm tra ở **server**, theo **phòng ban**, **fail-closed**. UI chỉ để hiển thị.
- **INV-10 (Không lộ secret):** Không hardcode key/password/token. `config.js` fail-fast khi `NODE_ENV=production`.

### 0.4. Definition of Done (DoD) — bắt buộc cho **mọi** Phase

Một Phase chỉ xong khi **cả 5** đạt:

```bash
cd backend
node scripts/verify.js          # ≥ 297 assert, 0 fail  (sẽ tăng lên theo từng Phase)
npm test                        # # pass N, # fail 0
npm run migrate                 # chạy 2 lần liên tiếp — idempotent, không lỗi
```

Với thay đổi liên quan PostgreSQL:

```bash
# BẮT BUỘC phải chạy được ở local (docker compose) hoặc CI:
PG_HOST=localhost PG_USER=bizops PG_PASSWORD=bizops PG_DB=bizops_test node src/db/migrate.js
PG_HOST=localhost PG_USER=bizops PG_PASSWORD=bizops PG_DB=bizops_test npm test
```

Với thay đổi FE:

```bash
cd frontend && npm run build && cd ../storefront && npm run build
node storefront/scripts/e2e-browser.cjs   # 19/19 check xanh
```

---

## 1. PHASE 0 — DỰNG LẠI "BÌNH THƯỜNG" & KHÔNG ĐỂ CI NÓI DỐI (nền móng bắt buộc)

> **Bắt buộc làm Phase 0 trước**, nếu không mọi lỗi dưới đây sẽ bị giấu.

### 1.1. Bắt bug "test xanh giả"

**Hiện trạng:** `backend/tests/setup.js` set `DATABASE_PATH='../data/bizops.db'` — **đường dẫn tương đối phụ thuộc CWD**. Chạy `npm test` từ thư mục khác, hoặc từ `CI` với `DATABASE_PATH` còn sót ⇒ test chạy trên **DB rỗng** ⇒ fail hàng loạt, hoặc (nguy hiểm hơn) **ghi bậy vào DB dev**.

**Sửa:**
- `backend/tests/setup.js`: resolve `DATABASE_PATH` **tuyệt đối** theo `__dirname`:
  ```js
  const path = require('path');
  process.env.DATABASE_PATH = process.env.DATABASE_PATH
    ? path.resolve(__dirname, '..', '..', process.env.DATABASE_PATH.replace(/^\.\.\//, ''))
    : path.resolve(__dirname, '..', '..', 'data', 'bizops-test.db');
  ```
- Tạo **DB test riêng** `data/bizops-test.db`, KHÔNG dùng `data/bizops.db`.
- `backend/tests/setup.js`: **tự chạy migrate + seed** nếu DB test chưa có bảng (idempotent), để `npm test` luôn xanh **từ sạch**:
  ```js
  const { migrate } = require('../src/db/migrate');
  // chạy 1 lần, cache bằng biến module-level để không chạy lại mỗi file test
  ```
- Thêm `backend/tests/setup.js` guard: nếu `DATABASE_PATH` trỏ vào `data/bizops.db` (dev DB) ⇒ **throw** để chặn ghi nhầm.

### 1.2. `verify.js` phải **bắt được** lỗi dialect, không báo "xanh giả"

- **Sửa lint SQLite-only**: hiện chỉ bắt `date('now')`. Phải bắt **mọi** hàm SQLite-only, kể cả `date(<cột>)`:
  ```js
  const FORBIDDEN = [
    [/datetime\s*\(/i, 'datetime('],
    [/date\s*\(\s*'now'/i, "date('now'"],
    [/date\s*\(\s*[a-z_]/i, 'date(<col>) — SQLite-only, dùng CAST(col AS TEXT)'],
    [/strftime\s*\(/i, 'strftime('],
    [/julianday\s*\(/i, 'julianday('],
    [/INSERT\s+OR\s+(IGNORE|REPLACE)/i, 'INSERT OR IGNORE/REPLACE'],
    [/AUTOINCREMENT/i, 'AUTOINCREMENT'],
    [/IFNULL\s*\(/i, 'IFNULL('],
  ];
  ```
- **Thêm assert "2 dialect đồng bộ"**: parse `CREATE TABLE` từ cả 2 file migration, so sánh **tập tên bảng** và **tập tên cột**; bảng/cột lệch ⇒ FAIL với diff in ra.
- **Thêm assert "không có biến kiểu sai trong cột ID"**: mọi cột tên `*_by`, `*_id`, `requester`, `decided_by`, `employee_id` phải là kiểu **số** ⇒ code chỉ được truyền **số**. (Bắt được P0-1.)
- **Thêm assert "mọi `created_by` trong code là số"**: lint `src/**/*.js` — mọi chỗ truyền `created_by`/`actor` vào cột `created_by` phải là `req.user.id` (số) **hoặc** `null`; nếu truyền `req.user.username` ⇒ FAIL.

### 1.3. `seed-storefront.cjs` phải chạy được trên **cả 2 dialect**

Hiện tại dùng `better-sqlite3` cứng ⇒ **PG CI job luôn đỏ**, và dùng `date('now', …)` (SQLite-only).

**Sửa:** viết lại `backend/seed-storefront.cjs` dùng **adapter `common/db.js`** (đã abstraction 2 dialect):
- Bỏ `date('now','-1 day')` → `businessDayVN(-1)` / `businessDayVN(30)`.
- Bỏ `ON CONFLICT(id) DO NOTHING` ở `product_prices` (id không có UNIQUE ⇒ lỗi PG) → dùng `WHERE NOT EXISTS` hoặc thêm UNIQUE `(sku, channel, start_time)`.
- Bỏ `ON CONFLICT(sku)` nếu `products.sku` là PRIMARY KEY (đã OK) — giữ.
- Chạy trong **1 transaction**.

### 1.4. `migrate.js`: không được nuốt lỗi cả file

Hiện tại `db.exec(sql)` cho cả file; lần chạy thứ 2 lỗi ở `ALTER TABLE … ADD COLUMN` đầu tiên ⇒ **cả file bị abort** ⇒ các `CREATE TABLE` phía sau **không bao giờ được tạo** ở lần migrate sau.

**Sửa (SQLite):** tách file thành từng statement, chạy **từng statement** và bỏ qua **chính xác** lỗi `duplicate column name`:
```js
for (const stmt of splitStatements(sql)) {
  try { db.exec(stmt); }
  catch (e) {
    if (/duplicate column name/i.test(e.message)) { console.warn('Skip (đã có cột):', stmt.slice(0,80)); continue; }
    throw e;
  }
}
```
Tách statement phải **an toàn với trigger** (`CREATE TRIGGER … BEGIN … END;`) — dùng `sqlite3` `complete_statement` hoặc viết splitter nhận biết `BEGIN…END;`.

**Sửa (PostgreSQL):** `ADD COLUMN IF NOT EXISTS` đã có; bổ sung `schema_migrations` gate để **bỏ qua file đã apply**:
```js
const applied = await client.query('SELECT version FROM schema_migrations');
// nếu version đã có -> skip file
```
Hiện tại PG **ghi** `schema_migrations` nhưng **không đọc** để skip ⇒ chạy lại vẫn exec toàn bộ file.

### 1.5. Sửa `todayVN()` / `businessDayVN()` — lệch 1 ngày (INV-5)

```js
function tzVN(d = new Date()) {
  // Trả về chuỗi 'YYYY-MM-DD HH:mm:ss' theo giờ VN — KHÔNG đi qua Date/UTC.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t) => parts.find(p => p.type === t).value;
  return { y: g('year'), m: g('month'), d: g('day'), hh: g('hour'), mm: g('minute'), ss: g('second') };
}
function todayVN() { const t = tzVN(); return `${t.y}-${t.m}-${t.d}`; }
function businessDayVN(offsetDays = 0) {
  const t = tzVN();
  const dt = new Date(Date.UTC(Number(t.y), Number(t.m) - 1, Number(t.d)) + offsetDays * 86400000);
  return dt.toISOString().slice(0, 10);
}
function nowISO() { const t = tzVN(); return `${t.y}-${t.m}-${t.d} ${t.hh}:${t.mm}:${t.ss}`; }
```
**Bổ sung test** (`backend/tests/time-vn.test.js`): khẳng định `todayVN()` đúng ở các mốc `2026-01-01T17:30:00Z` (= 00:30 VN ngày 2), `2026-11-07T00:00:00Z` (= 07:00 VN ngày 7), `2026-11-07T17:00:00Z` (= 00:00 VN ngày 8).

### 1.6. Chuẩn hoá **mọi** cột timestamp về **1 định dạng**

Hiện trạng (nguồn gốc lỗi P1-11):
- `refresh_tokens.expires_at` ← `new Date(...).toISOString()` ⇒ `2026-11-14T03:11:54.871Z`
- `order_lookup_tokens.expires_at` ← `.toISOString().slice(0,19).replace('T',' ')` ⇒ `2026-11-14 03:11:54`
- `nowISO()` ⇒ `2026-11-07 03:11:54`

⇒ so sánh **chuỗi** lệch nhau (`'T'` vs `' '`, có/không `Z`) ⇒ điều kiện `expires_at > ?` **sai**.

**Sửa:**
1. `common/db.js` thêm helper `toSqlDateTime(d)` → `'YYYY-MM-DD HH:mm:ss'` (không TZ, theo giờ VN cho mốc nghiệp vụ).
2. **Mọi nơi insert `expires_at`** dùng `toSqlDateTime()`: `common/auth.js` (login + refresh), `public/orders.js` (lookup token).
3. `auth.js` so sánh `new Date(row.expires_at)` → so sánh **chuỗi** theo cùng định dạng, hoặc ép `CAST`:
   ```js
   const expired = String(row.expires_at).replace('T', ' ').slice(0, 19) < nowISO();
   ```
   (`'2026-11-14 03:11:54' < '2026-11-07 03:11:54'` ⇒ so sánh lexicographic **đúng** vì định dạng ISO-lexicographic.)
4. `public/lookup.js` và `agent_svc/src/brain/public.js`: cùng cách.
5. **Migration** (`003_datetime_normalize.sql` + `.postgres.sql`): `UPDATE refresh_tokens SET expires_at = substr(replace(expires_at,'T',' '),1,19) WHERE length(expires_at) > 19;` tương tự `order_lookup_tokens`.

---

## 2. PHASE 1 — P0-1: SỬA LỖI KIỂU `created_by` (BLOCKER PRODUCTION)

> **Đây là lỗi chặn production.** Toàn bộ luồng tạo dữ liệu (đơn ERP, đơn web, kho, công nợ, PO, báo giá, hợp đồng, chi phí) **trả 500** trên PostgreSQL vì `created_by BIGINT` nhận chuỗi username.

### 2.1. Quyết định thiết kế (chọn 1, khuyến nghị **A**)

**Phương án A (khuyến nghị) — giữ `created_by` là BIGINT, truyền `user.id`:**
- Đồng bộ với `approvals.requester` / `decided_by` (đã là BIGINT + số).
- Không đổi schema ⇒ không cần migration dữ liệu.
- `audit_log.actor` vẫn là **TEXT** (giữ username để đọc dễ) — không đổi.

**Phương án B — đổi `created_by` sang TEXT:** phải migration cả 2 dialect + backfill. **Chỉ chọn nếu** cần hiển thị username trực tiếp trên bảng nghiệp vụ.

### 2.2. Thay đổi bắt buộc (phương án A)

Tạo helper trong `backend/src/common/auth.js`:
```js
/** ID người dùng dạng số — dùng cho các cột *_by/created_by kiểu BIGINT. */
function actorId(user) {
  const id = Number(user && user.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}
```
Export `actorId`.

Sửa **toàn bộ** call-site truyền `req.user.username` vào `created_by`:

| File | Dòng | Sửa |
|---|---|---|
| `backend/src/routes/sales.js` | 70 (`quotes`) | `created_by: actorId(req.user)` |
| `backend/src/routes/sales.js` | 87 (`contracts`) | `created_by: actorId(req.user)` |
| `backend/src/routes/finance.js` | 112 (`expenses`) | `created_by: actorId(req.user)` |
| `backend/src/routes/supply.js` | 32, 42 (`stock_moves`) | truyền `created_by: actorId(req.user)` vào `moveStock` |
| `backend/src/routes/supply.js` | 78 (`purchase_orders`) | `created_by: actorId(req.user)` |
| `backend/src/routes/supply.js` | 93 (`shipments`) | `created_by: actorId(req.user)` |
| `backend/src/modules/sales/service.js` | 76 (`orders`) | `created_by: created_by_id` (số) |
| `backend/src/modules/sales/service.js` | 95 (`stock_moves`) | `created_by: created_by_id` |
| `backend/src/modules/sales/service.js` | 99 (`debts`) | `created_by: created_by_id` |
| `backend/src/modules/supply/service.js` | 48 (`stock_moves`) | `created_by: created_by_id` |
| `backend/src/modules/supply/service.js` | 93 (`purchase_orders`) | `created_by: created_by_id` |
| `backend/src/modules/finance/service.js` | 28 (`debts`) | `created_by: created_by_id` |
| `backend/src/modules/finance/service.js` | 41 (`debts`) | `created_by: created_by_id` |
| `backend/src/public/orders.js` | 113 (`orders`) | `created_by: NULL` (đơn web không có user ERP) — hoặc `storefront_system_user_id` nếu bạn tạo user hệ thống |

**Quy ước mới cho signature service (bắt buộc):**
- Tất cả service nhận **2 tham số tác giả tách biệt**: `actor` (username, để ghi vào `audit_log.actor` — TEXT) và `actor_id` (số, để ghi vào `created_by` — BIGINT).
- Mặc định `actor_id = null` (nghiệp vụ tự động: cron, webhook, storefront).
- `writeAudit` vẫn nhận `actor` (username) — **không đổi**.

**Truyền `actor_id` xuyên suốt call-chain:**
- `routes/sales.js` → `salesService.createOrder({ …, created_by: req.user.username, actor_id: actorId(req.user) })`
- `salesService.createOrder` → `supplyService.moveStock(c, { created_by, actor_id })`, `financeService.createReceivable(c, { created_by, actor_id })`, `supplyService.createShipment(c, { created_by, actor_id })`
- `salesService.cancelOrder/refundOrder` → `moveStock(..., actor_id)`
- `routes/supply.js` → `supplyService.moveStock/createPO/createShipment({ created_by, actor_id })`
- `routes/finance.js` → `financeService.createReceivable/createPayable/recordPayment({ actor, actor_id })`
- `financeService.recordPayment` → `salesService.setOrderPaid(c, orderId, actor)`

### 2.3. `audit_log.actor` — chuẩn hoá

`audit_log.actor` là TEXT, hiện có **2 loại giá trị trộn lẫn**: username (`'admin'`) và **user id** (`String(requester)` trong `approvals.requestApproval` ⇒ `'5'`). Sửa `approvals.requestApproval` nhận thêm `actor` (username) và ghi `actor` vào `audit_log`, còn `approvals.requester` giữ là **user id** (số).

### 2.4. Migration bắt buộc (nếu chọn phương án B, hoặc nếu DB đã có dữ liệu chuỗi)

Tạo `backend/src/db/migrations/003_actor_id.sql` **và** `003_actor_id.postgres.sql`:
- PG: `ALTER TABLE <t> ALTER COLUMN created_by TYPE BIGINT USING NULLIF(regexp_replace(created_by, '\D', '', 'g'), '')::BIGINT;` — chỉ khi có dữ liệu chuỗi.
- Thêm `CHECK (created_by IS NULL OR created_by > 0)`.

### 2.5. Test bắt buộc

`backend/tests/pg-dialect.test.js` (chạy **cả** SQLite và PG):
```js
// tạo mọi bảng nghiệp vụ có created_by bằng số → không được lỗi kiểu
// và assert typeof row.created_by === 'number'
```
CI: thêm job `pg-dialect` chạy `node --test tests/pg-dialect.test.js` với `PG_HOST` set.

---

## 3. PHASE 2 — P0-2 + P1-11/12: VÒNG ĐỜI REFRESH TOKEN CHUẨN

> Hiện trạng: xoay vòng **đúng**, nhưng **reuse-detection không có tác dụng** vì lệnh thu hồi bị rollback.

### 3.1. Bắt lỗi P0-2 (rollback nuốt lệnh thu hồi)

Hiện tại (`backend/src/common/auth.js`):
```js
if (revoked) {
  await c.run('UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=? AND revoked IS NOT TRUE', [row.user_id]); // ← trong tx
  throw new AppError('AUTH', 'Refresh token het han', 401); // ← ROLLBACK huỷ lệnh trên
}
```

**Sửa (bắt buộc) — thu hồi phải **ngoài transaction**:**
```js
async function refresh(refreshToken) {
  if (!refreshToken) throw new AppError('AUTH', 'Refresh token het han', 401);
  const h = hashToken(refreshToken);
  const db = require('./db');

  // Bước 1: đọc + kiểm tra NGOÀI tx (đọc là thao tác đơn giản, không cần khoá).
  const row = await db.get('SELECT * FROM refresh_tokens WHERE token_hash=?', [h]);
  if (!row) throw new AppError('AUTH', 'Refresh token het han', 401);

  const expired = String(row.expires_at).replace('T', ' ').slice(0, 19) < nowISO();
  const revoked = row.revoked === 1 || row.revoked === true;

  if (revoked) {
    // REUSE DETECTED → thu hồi TOÀN BỘ session của user, GHI RIÊNG (không bị rollback).
    await db.run('UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=? AND revoked IS NOT TRUE', [row.user_id]);
    logger.warn('refresh token reuse detected — thu hoi toan bo session', { user_id: row.user_id, token_id: row.id });
    await db.run(
      "INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)",
      [String(row.user_id), 'security.refresh_reuse', 'refresh_tokens', row.id, null, JSON.stringify({ revoked_all: true })]
    );
    throw new AppError('AUTH', 'Refresh token het han', 401);
  }
  if (expired) throw new AppError('AUTH', 'Refresh token het han', 401);

  // Bước 2: xoay vòng ATOMIC trong 1 tx (conditional update + insert).
  return db.tx(async (c) => {
    const upd = await c.run('UPDATE refresh_tokens SET revoked=TRUE WHERE id=? AND revoked IS NOT TRUE', [row.id]);
    if (!upd || Number(upd.changes) !== 1) throw new AppError('AUTH', 'Refresh token het han', 401);
    const user = await c.get('SELECT * FROM users WHERE id=?', [row.user_id]);
    if (!user) throw new AppError('AUTH', 'Tai khoan khong ton tai', 401);
    const access = signAccess(user);
    const next = crypto.randomBytes(32).toString('hex');
    await c.run('INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)',
      [user.id, hashToken(next), toSqlDateTime(new Date(Date.now() + REFRESH_DAYS * 86400000))]);
    await c.run('INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)',
      [String(user.username), 'security.refresh_rotate', 'refresh_tokens', row.id, null, null]);
    return { token: access, refresh: next };
  });
}
```

**Bắt buộc:** `audit_log` insert trong tx của rotate ⇒ tuân thủ INV-2. Lệnh `revoke-all` ở nhánh reuse là **hành động bảo mật**, ghi ngoài tx là chấp nhận được — **nhưng phải comment giải thích** trong code để reviewer không "sửa nhầm".

### 3.2. Mở rộng schema `refresh_tokens` (2 dialect)

Thêm cột (migration `004_session.sql` + `.postgres.sql`):
```sql
ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN ip TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN device_label TEXT NULL;
ALTER TABLE refresh_tokens ADD COLUMN rotated_from_id BIGINT NULL;
ALTER TABLE refresh_tokens ADD COLUMN last_used_at TIMESTAMP NULL;
ALTER TABLE refresh_tokens ADD COLUMN revoked_reason TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);
```
(SQLite: `ADD COLUMN` không có `IF NOT EXISTS` — dùng splitter của Phase 1.4.)

### 3.3. Ràng buộc phiên (session) đầy đủ

1. **Ghi metadata khi login/rotate**: `user_agent` (cắt 200), `ip` (đã qua `clientIp(req)`), `device_label` (parse UA rút gọn: `Chrome / Windows`).
2. **Binding IP/UA (mềm, theo ngưỡng)**: khi refresh, nếu `ip` khác ⇒ **ghi cảnh báo** vào `audit_log` (`security.refresh_ip_mismatch`), **không** chặn ngay (NAT đổi IP là bình thường). Nếu `user_agent` khác hoàn toàn ⇒ coi là **reuse** ⇒ thu hồi toàn bộ session.
3. **Giới hạn số phiên đồng thời**: tối đa **5** refresh token *active* / user. Khi login mới và vượt ⇒ thu hồi token cũ nhất (`revoked_reason='session_limit'`).
4. **Dọn bảng (cron)**: thêm vào `backend/src/common/scheduler.js` (nơi cron duy nhất — INV của repo):
   ```js
   cron.schedule('30 3 * * *', async () => {
     await run("DELETE FROM refresh_tokens WHERE expires_at < ? OR (revoked IS NOT TRUE AND created_at < ?)",
       [nowISO(), nowMinusDays(30)]);
   }, { timezone: 'Asia/Ho_Chi_Minh' });
   ```
5. **`logout` phải thu hồi đúng**: thêm tham số `all`:
   - `POST /api/auth/logout` (mặc định): thu hồi token hiện tại **và** xoá cookie.
   - `POST /api/auth/logout-all`: thu hồi **toàn bộ** token của user hiện tại.
6. **API quản lý phiên** (mới):
   - `GET /api/auth/sessions` → danh sách phiên active (device, ip, created_at, last_used_at) — **chỉ user của chính mình**.
   - `DELETE /api/auth/sessions/:id` → thu hồi 1 phiên.

### 3.4. Access token: rút ngắn + thêm `jti` + `auth_version`

- `ACCESS_TTL`: `8h` → **`30m`** (kèm refresh tự động ở FE — Phase 4).
- JWT payload thêm:
  ```js
  { sub, username, role, employee_code, jti: crypto.randomUUID(), av: user.auth_version }
  ```
- Thêm cột `users.auth_version INTEGER DEFAULT 1`.
- `authenticate`: nếu `p.av !== user.auth_version` ⇒ **401** (dùng để vô hiệu hoá toàn bộ access token khi đổi mật khẩu / đổi role / khoá tài khoản).
- `users` module (chưa có route tạo/sửa user — hiện chỉ có `POST /users/:id/unlock`): khi HR/CEO **đổi role** hoặc **đổi mật khẩu** ⇒ `UPDATE users SET auth_version = auth_version + 1` ⇒ mọi access token cũ chết ngay.

### 3.5. Rate-limit + CSRF cho auth

- `POST /api/auth/refresh`: thêm limiter riêng `refreshLimiter` (10 req / 15 phút / IP) — trong `common/security.js`.
- `POST /api/auth/login`: hạ `loginLimiter` 30 → **10** / 15 phút / IP, và thêm giới hạn theo **username** (10/15 phút / username) để chặn brute-force dồn vào 1 tài khoản.
- **CSRF**: vì dùng `httpOnly` cookie + `SameSite=Lax` ⇒ cross-site POST không gửi cookie ⇒ CSRF chặn ở mức browser. **NHƯNG** phải thêm:
  - `common/security.js`: middleware `csrfGuard` — cho mọi route `POST/PUT/PATCH/DELETE` (trừ `/api/public/*`, `/api/auth/login`, `/api/auth/refresh`):
    ```js
    // double-submit cookie
    const token = req.cookies?.csrf_token;
    const header = req.headers['x-csrf-token'];
    if (!token || token !== header) → 403 CSRF
    ```
  - `POST /api/auth/login` và `/refresh` **phải set** cookie `csrf_token` (KHÔNG httpOnly) + trả `csrf_token` trong body → FE gửi header `X-CSRF-Token`.
  - `SameSite` → **`'strict'`** cho ERP nếu không cần cross-site; storefront dùng `'lax'`.

### 3.6. Test bắt buộc (mở rộng `backend/tests/security-regression.test.js`)

```js
test('sec02a: reuse detection THU HOI THAT toan bo session (khong bi rollback)', async () => {
  const { login, refresh } = require('../src/common/auth');
  const a = await login('admin', 'Admin@123');
  const b = await login('admin', 'Admin@123');
  await refresh(a.refresh);                       // xoay vong
  await assert.rejects(() => refresh(a.refresh)); // reuse
  const rows = await db.all('SELECT revoked FROM refresh_tokens WHERE user_id=?', [a.user.id]);
  assert.equal(rows.filter(r => !r.revoked).length, 0, 'MOI token phai bi thu hoi');
});

test('sec02b: logout-all thu hoi toan bo phien', …);
test('sec02c: access token bi vô hiệu hoá khi auth_version tang', …);
test('sec02d: expires_at luôn luu theo 1 dinh dang', …);
test('sec02e: CSRF guard chan POST thieu X-CSRF-Token', …);
test('sec02f: refresh limiter chan flood', …);
```

---

## 4. PHASE 3 — P0-3/4/5 + P2-19: PHÂN QUYỀN THEO PHÒNG BAN (SCOPE V2)

> Đây là hạng mục lớn nhất. Nguyên tắc: **scope phải được enforce ở server, theo phòng ban, fail-closed, và áp dụng ĐỒNG NHẤT cho mọi route.**

### 4.1. Sửa triệt để `backend/src/common/scope.js`

**a) `resolveScope` — bỏ phụ thuộc `employee_code` rỗng:**
```js
function resolveScope(user) {
  const role = user && user.role;
  const roles = loadRoles();
  const scope = (roles.role_scopes || {})[role] || {};
  const declared = scope.dept || 'multi';
  const userDept = (user && user.dept_code) || null;

  // Vai toan cuc: doc moi noi dung (ngoai tru phan quyen tien/luong rieng).
  if (role === 'owner' || role === 'ceo') {
    return { role, dept: declared, userDept, allDepts: true, depts: ALL_DEPTS };
  }
  // Vai theo khoi (director/coo/manager/leader/staff): phong ban cua user + cay con.
  if (declared === 'multi') {
    const depts = userDept ? [userDept, ...(SCOPE_DEPT_SUBTREE[userDept] || [])] : [];
    return { role, dept: declared, userDept, allDepts: false, depts };
  }
  // Vai gan 1 phong ban.
  return { role, dept: declared, userDept, allDepts: false, depts: [declared] };
}
```
**Quy tắc fail-closed mới (quan trọng):** nếu `declared === 'multi'` mà `userDept == null` ⇒ **KHÔNG được** coi là "đọc hết" và **KHÔNG được** âm thầm rỗng rồi trả 403 mọi thứ. Hãy:
- `authenticate` **phải** resolve `dept_code` cho mọi user có role không phải `owner/ceo`; nếu không tìm thấy employee ⇒ **gán `dept_code = null` và `scope_denied = true`**, và `requirePerm` + `scopeFilter` phải **từ chối mọi truy cập dữ liệu phòng ban** (fail-closed) — trừ khi role không cần dept (ví dụ `attendance.checkin` của chính mình).
- Thêm endpoint nghiệp vụ `GET /api/auth/me` trả kèm `dept_code` + `scope.depts` để FE hiển thị và debug.

**b) `SCOPE_DEPT_SUBTREE` — bổ sung `ceo` và `it/qa/product`:**
```js
const SCOPE_DEPT_SUBTREE = {
  ceo:     ['ceo','sales','marketing','cskh','ops','supply','finance','hr','it','legal','qa','product'],
  sales:   ['sales','cskh','marketing'],
  marketing: ['marketing'],
  cskh:    ['cskh'],
  supply:  ['supply','ops'],
  ops:     ['ops'],
  finance: ['finance'],
  hr:      ['hr'],
  it:      ['it'],
  legal:   ['legal'],
  qa:      ['qa'],
  product: ['product'],
};
```

**c) `scopeFilter` — fail-closed, không “giữ row không rõ phòng ban”:**
```js
function scopeFilter(user, rows, deptField = 'dept_code') {
  if (!Array.isArray(rows)) return rows;
  const s = resolveScope(user);
  if (s.allDepts) return rows;
  // Fail-closed: row KHONG có dept (null/undefined) => KHÔNG tự động cho qua.
  // Chỉ giữ nếu bảng đó không gắn phòng ban (deptField === null) — khi đó caller phải lọc tay.
  if (deptField === null) return rows;
  return rows.filter((r) => {
    const d = r && r[deptField];
    if (d == null || d === '') return false;       // <-- FAIL-CLOSED
    return s.depts.includes(String(d));
  });
}
```
> **Lưu ý:** với bảng không có cột phòng ban (đơn hàng, sản phẩm…), `scopeFilter` **không áp dụng được**. Vì vậy phải chuyển sang mô hình **sở hữu theo nhân viực** ở 4.3.

### 4.2. Bổ sung **bảng ánh xạ phòng ban** cho các bảng không có `dept_code`

Tạo bảng mới (migration `005_dept_scope.sql` + `.postgres.sql`):
```sql
CREATE TABLE IF NOT EXISTS resource_dept (
  table_name TEXT NOT NULL,
  record_id BIGINT NOT NULL,
  dept_code TEXT NOT NULL REFERENCES departments(code) ON DELETE RESTRICT,
  owner_employee_id BIGINT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (table_name, record_id)
);
CREATE INDEX IF NOT EXISTS idx_resource_dept_dept ON resource_dept(dept_code);
```
**Ghi vào `resource_dept` trong CÙNG transaction** mỗi khi tạo bản ghi (đơn, khách hàng, lead, quote, contract, PO, shipment, ticket, campaign, risk, IT incident, product feature, chứng từ). Ghi trong service sở hữu ⇒ tuân thủ INV-2.

Quy tắc xác định `dept_code` khi tạo:
| Bảng | dept_code suy ra |
|---|---|
| `orders` | `employee_id` → `employees.dept_code`; nếu null ⇒ `sales` |
| `order_items` | theo `orders` |
| `customers` | `owner_employee_id` → dept; nếu null ⇒ `sales` |
| `leads` | `owner_employee_id` → dept; null ⇒ `sales` |
| `quotes`/`contracts` | theo `customers` |
| `shipments` | theo `orders` |
| `tickets` | theo `customers` (null ⇒ `cskh`) |
| `debts`/`payments` | theo `orders` (null ⇒ `finance`) |
| `stock_moves` | `supply` |
| `purchase_orders` | `supply` |
| `transactions`/`expenses`/`budgets` | `finance` |
| `approvals` | theo `ref_type`/`ref_id`; requester dept |
| `campaigns` | `marketing` |
| `risks` | `legal` |
| `it_incidents` | `it` |
| `product_features` | `product` |
| `qa_checks` | `qa` |
| `employees`/`attendance`/`recruitments`/`trainings` | `employees.dept_code` (đã có sẵn) |

### 4.3. `assertResourceScope` — dùng `resource_dept` thay vì cột vật lý

```js
const RESOURCE_DEPT = {
  employees: 'dept_code',       // cột thật
  recruitments: 'dept_code',
  budgets: 'dept_code',
  sop_tasks: 'dept_code',
  resource_dept: 'dept_code',   // bảng ánh xạ
};

async function assertResourceScope(conn, user, table, id, { deptField } = {}) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  const field = deptField || RESOURCE_DEPT[table];
  if (!field) throw new AppError('FORBIDDEN', `Chua khai bao scope cho ${table}`, 500); // FAIL-CLOSED
  const row = await db.get(`SELECT ${field} AS dept_code FROM ${table} WHERE id=?`, [id]);
  if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay ban ghi', 404);
  enforceDept(user, row.dept_code, `${table}#${id}`);
  return true;
}

/** Bản generic: đọc dept từ resource_dept cho MỌI bảng nghiệp vụ. */
async function assertBusinessScope(conn, user, table, id) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  const row = await db.get('SELECT dept_code FROM resource_dept WHERE table_name=? AND record_id=?', [table, id]);
  if (!row) throw new AppError('FORBIDDEN', `Khong xac dinh duoc phong ban cua ${table}#${id}`, 403);
  enforceDept(user, row.dept_code, `${table}#${id}`);
  return true;
}
```
**Bỏ các entry `null`** trong `RESOURCE_DEPT` (đó chính là lỗ P0-4): thay bằng `resource_dept`.

### 4.4. Middleware chuẩn — **bắt buộc dùng ở MỌI route**

Thêm vào `backend/src/common/scope.js`:
```js
/** Middleware: requirePerm + scope theo phong ban (dung chung cho moi route). */
function requireScoped(perm, opts = {}) {
  return (req, res, next) => {
    try {
      const { requirePerm } = require('./auth');
      requirePerm(perm)(req, res, (err) => {
        if (err) return next(err);
        if (opts.deptParam) enforceDept(req.user, req.params?.[opts.deptParam] || req.query?.[opts.deptParam] || req.body?.[opts.deptParam], opts.deptParam);
        if (opts.selfOnly) { /* so sanh req.user.id vs req.params.id */ }
        return next();
      });
    } catch (e) { return next(e); }
  };
}
```
Và **một helper `scopedList`** để mọi `GET` trả về đúng phạm vi:
```js
async function scopedRows(user, table, baseSql, params = []) {
  const db = require('./db');
  const s = resolveScope(user);
  if (s.allDepts) return db.all(baseSql, params);
  if (!s.depts.length) return [];
  const ph = s.depts.map(() => '?').join(',');
  return db.all(
    `${baseSql.replace(/ORDER BY/i, `WHERE (d.dept_code IN (${ph})) ORDER BY`)}`,
    [...params, ...s.depts]
  );
}
```
> Yêu cầu: mọi list query **phải JOIN `resource_dept`**.

### 4.5. Áp dụng vào **từng route file** (bảng kê chính xác)

#### `backend/src/routes/sales.js`
| Route | Hiện tại | Sau |
|---|---|---|
| `GET /customers` | toàn bộ KH | JOIN `resource_dept` + lọc `dept_code IN scope`; thêm `?search`, `?page`, `?limit` |
| `GET /customers/:id` | toàn bộ | `assertBusinessScope(conn, user, 'customers', id)` |
| `POST /customers` | ok | ghi `resource_dept` (dept của `owner_employee_id` hoặc `sales`) |
| `GET /leads` | toàn bộ | lọc scope (dept của owner) |
| `POST /leads` | `owner_employee_id` không set | **set `owner_employee_id = req.user.employee_code`** nếu có; dept = dept của user |
| `POST /leads/:id/convert` | không scope | `assertBusinessScope` |
| `GET /quotes` | toàn bộ | lọc scope |
| `POST /quotes` | `created_by` sai kiểu | fix P0-1 + `resource_dept` |
| `GET /contracts` | toàn bộ | lọc scope |
| `POST /contracts` | idem | fix + `resource_dept` |
| `POST /contracts/:id/submit-approval` | **không scope** | `assertBusinessScope` + dùng `approval-matrix.json` (không hardcode 50tr) |
| `GET /orders` | toàn bộ | lọc scope — **đây là route quan trọng nhất** |
| `POST /orders` | `employee_id` tuỳ ý từ body | **chỉ cho phép `employee_id` của chính user** (hoặc null ⇒ tự động = user); không nhận employee_id bất kỳ |
| `POST /orders/:id/cancel` | không scope | `assertBusinessScope` |
| `POST /orders/:id/refund` | không scope | `assertBusinessScope` |
| `GET /sales/kpi` | toàn công ty | tính KPI **trong scope**; thêm header `X-Scope-Depts` để audit |

#### `backend/src/routes/finance.js`
| Route | Sau |
|---|---|
| `GET /transactions` | lọc theo scope (dept `finance` ⇒ CFO/ke toán vẫn thấy hết phòng ban tài chính — đó là chính sách, OK) |
| `GET /debts` | lọc scope |
| `GET /expenses` | lọc scope |
| `GET /budgets` | lọc scope theo `dept_code` (CFO xem hết, không ai khác xem được phòng khác) |
| `POST /budgets` | `enforceDept(req.user, dept_code)` |
| `POST /expenses` | chuyển sang `tx` + `writeAudit` + `gov.requestApproval` (bỏ hardcode ngưỡng) |
| `POST /payments` | `assertBusinessScope` khi có `order_id` (để phòng khác không ghi payment lên đơn ngoài scope) |
| `POST /debts` | `assertBusinessScope` cho `customer_id`/`order_id` |

#### `backend/src/routes/supply.js`
| Route | Sau |
|---|---|
| `GET /products` | toàn bộ là OK (catalog nội bộ) — nhưng `GET /ops/alerts` phải lọc theo scope `supply` |
| `GET /suppliers`, `GET /purchase-orders`, `GET /shipments`, `GET /qa-checks`, `GET /sop-tasks` | lọc scope |
| `POST /sop-tasks` | `enforceDept(req.user, req.body.dept_code)` + `tx` + audit |
| `POST /qa-checks` | `assertBusinessScope` theo `ref_type`/`ref_id` |
| `POST /stock/in|out` | `resource_dept` dept `supply`; `tx` + audit (đã có trong service) |
| `PATCH /shipments/:id` | `assertBusinessScope` |

#### `backend/src/routes/gov-min.js`
| Route | Sau |
|---|---|
| `GET /approvals` | lọc scope theo dept của `ref`; **chỉ hiện approval liên quan phòng ban mình** |
| `POST /approvals/:id/decide` | `assertBusinessScope` trước khi quyết + khoá dòng (Phase 5) |
| `GET /audit` | lọc scope: chỉ trả audit của bản ghi **trong phòng ban mình** (join `resource_dept`) |
| `POST /users/:id/unlock` | giữ `users.unlock`; ghi audit trong tx (đã có) |

#### `backend/src/routes/hr.js`
- Giữ `scopeFilter` hiện có, nhưng **bổ sung**: `GET /hr/today`, `GET /hr/payroll-preview` phải lọc theo scope (HR theo `hr` ⇒ chỉ thấy phòng HR — nhưng chính sách nghiệp vụ là HR **phải** thấy toàn công ty ⇒ cần **vai trò riêng**: `hr` role có `scope.dept = 'multi_all_hr'` ⇒ xem toàn bộ phòng ban nhưng **chỉ cột lương**; cấu hình bằng `role_scopes.hr.scope_read = 'all'`).

#### `backend/src/routes/helpdesk.js`
- `GET /cskh/tickets`, `GET /cskh/sla`, `GET /cskh/csat` ⇒ lọc scope theo `resource_dept` (dept `cskh` ⇒ CSKH xem hết ticket là chính sách; `sales` chỉ thấy ticket của khách mình).
- `PATCH /cskh/tickets/:id` ⇒ `assertBusinessScope`.
- `POST /ratings` ⇒ `assertBusinessScope` theo `order_id`/`ticket_id`.

#### `backend/src/routes/marketing.js`
- `GET /campaigns`, `GET /marketing/roi` ⇒ lọc scope `marketing`.
- `POST /campaigns` ⇒ `resource_dept` dept `marketing` + `tx` + audit.

#### `backend/src/routes/overview.js` (P0-5 — quan trọng nhất về mặt rò rỉ)
- `GET /departments/overview` và `GET /agent/brief`: **tách theo vai**:
  - `owner/ceo/director` ⇒ toàn công ty.
  - `manager/leader` ⇒ **chỉ khối của mình** (`SCOPE_DEPT_SUBTREE`).
  - `accountant/cfo` ⇒ tài chính + KPI tài chính toàn công ty (chính sách), **không** thấy lương/tồn kho chi tiết.
  - `warehouse/ops` ⇒ tồn kho + vận đơn + PO của `supply/ops`.
  - `cskh` ⇒ ticket/SLA/CSAT của `cskh` (+ đơn của khách họ phụ trách).
  - `sales` ⇒ KPI sales của scope sales.
  - `hr` ⇒ headcount/attendance của scope hr.
  - `staff` ⇒ **chỉ** ticket của mình + IT incident của mình + QA của mình.
- **Cơ chế:** viết `backend/src/modules/governance/overview.js` → `getOverview(conn, user)` nhận `user`, mỗi khối có guard:
  ```js
  const want = (dept) => canAccessDept(user, dept);
  out.finance = want('finance') ? await safe(...) : { hidden: true };
  ```
- `out.hr` **không bao giờ** trả `salary_base` cho người không có `hr.read`.
- Thêm `X-Scope-Depts` header trên mọi response overview để audit.

### 4.6. Cập nhật contract `roles-permissions.json`

- Thêm `scope_read` cho mỗi vai: `"all" | "dept" | "own" | "none"`.
- Thêm `resource_dept` mapping vào `table-ownership.json`.
- **Đồng bộ 2 bản** `docs/contract/roles-permissions.json` và `backend/docs/contract/roles-permissions.json` — hiện giống nhau, nhưng phải có assert trong `verify.js` rằng 2 file **giống hệt** (tránh drift).

### 4.7. Test bắt buộc (mở rộng `backend/tests/security-regression.test.js`)

```js
test('sec01d: manager sales KHONG doc duoc don phong ban khac', async () => {
  // tạo 2 đơn: 1 dept sales, 1 dept finance
  // GET /api/orders với token role manager (dept sales) → chỉ thấy 1 đơn
});
test('sec01e: warehouse KHONG doc duoc don cua phong ban khac');
test('sec01f: manager sales doi URL id don cua phong ban khac → 403');
test('sec01g: accountant KHONG thay doi duoc don hang (IDOR)');
test('sec01h: overview chi tra KPI trong scope (khong lo AR/DSO cho kho)');
test('sec01i: audit doc chi thay ban ghi trong scope');
test('sec01j: user khong co employee_code → fail-closed (khong xem het)');
test('sec01k: scopeFilter voi row khong co dept → bi lo (fail-closed)');
```

---

## 5. PHASE 4 — P1-6 … P1-21: SỬA LỖI LOGIC NGHIỆP VỤ

### 5.1. P1-6 — Chặn né duyệt qua `level` tùy ý (Approval)

**File:** `backend/src/modules/governance/approvals.js`

```js
async function requestApproval(conn, { ref_type, ref_id, requester, requester_username = null, level = null, note = null }) {
  const c = (conn && conn.run) ? conn : require('../../common/db');
  if (!['contract','purchase_order','expense','leave','discount'].includes(ref_type)) {
    throw new AppError('VALIDATION', 'ref_type khong hop le', 400);
  }
  // LUON tính level từ approval-matrix.json — KHÔNG tin `level` của client.
  const tbl = ref_type === 'expense' ? 'expenses'
            : ref_type === 'purchase_order' ? 'purchase_orders'
            : ref_type === 'contract' ? 'contracts' : null;
  if (!tbl) throw new AppError('VALIDATION', `ref_type ${ref_type} chua ho tro tu dong xep cap`, 400);
  const row = await c.get(`SELECT * FROM ${tbl} WHERE id=?`, [ref_id]);
  if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay chung tu', 404);

  const lv = ref_type === 'expense' || ref_type === 'purchase_order'
    ? levelForAmount(Number(row.amount))
    : (Number(row.amount) >= 50000000 ? 'ceo' : 'manager');

  if (level && level !== lv) {
    // Ghi log + từ chối yêu cầu ép cấp (không throw 500, trả 400 rõ ràng).
    throw new AppError('VALIDATION', `Cap duyet bat buoc cho ${ref_type} la '${lv}', khong cho ep cap '${level}'`, 400);
  }
  …
}
```
- `routes/gov-min.js` `POST /approvals`: **bỏ** truyền `req.body.level`; gọi `gov.requestApproval(null, { ref_type, ref_id, requester: req.user.id, requester_username: req.user.username, note })`.
- `routes/sales.js` `POST /contracts/:id/submit-approval`: **bỏ** hardcode `>= 50000000 ? 'ceo' : 'manager'` ⇒ gọi `gov.requestApproval` để dùng chung `approval-matrix.json`.
- `routes/finance.js` `POST /expenses`: **bỏ** `const level = amount < 5tr ? 'leader' : …` ⇒ gọi `gov.requestApproval`.
- `levelForAmount` phải **dùng** `approval-matrix.json` (`amount_routing.expense_po`) — đang làm vậy, nhưng thêm `contract` routing vào matrix để 1 nguồn duy nhất:
  ```json
  "amount_routing": {
    "expense_po": [ { "level": "leader", "lt": 5000000 }, { "level": "manager", "lt": 50000000 },
                     { "level": "cfo", "lt": 200000000 }, { "level": "ceo", "gte": 200000000 } ],
    "contract":   [ { "level": "manager", "lt": 50000000 }, { "level": "ceo", "gte": 50000000 } ]
  }
  ```
- `needsLegal(refType, amount, note)` — hiện `propagateApproval` gọi `needsLegal('contract', ct.amount, ct.code)` (truyền **code** làm note ⇒ sai). Sửa: lưu `note` vào `approvals.note` khi tạo, và `propagateApproval` đọc `ap.note` + `ap.rows[].note` đúng.
- `contracts.signed_date` phải được set khi chuyển `'signed'`: `UPDATE contracts SET status='signed', signed_date=? WHERE id=?`.

### 5.2. P1-7 — Khoá dòng + chống double-decide

```js
async function decideApproval(conn, approvalId, { decider, decider_username = null, decision, note = null }) {
  return withTx(async (c) => {
    const ap = await c.lock('SELECT * FROM approvals WHERE id=?', [approvalId]);  // FOR UPDATE trên PG
    if (!ap) throw new AppError('NOT_FOUND', 'Khong tim thay approval', 404);
    if (ap.status !== 'pending') throw new AppError('VALIDATION', 'Approval da quyet, cam chuyen tiep', 400);
    …
    const up = await c.run("UPDATE approvals SET status=?, decided_by=?, decided_at=?, note=? WHERE id=? AND status='pending'",
      [decision, decider, nowISO(), note, approvalId]);
    if (Number(up.changes) !== 1) throw new AppError('CONFLICT', 'Approval vua bi quyet boi giao dich khac', 409);
    …
  });
}
```
- Bổ sung `decided_at` dùng `nowISO()` (chuẩn hoá INV-5) thay vì `CURRENT_TIMESTAMP` (định dạng DB-native khác `nowISO()` ⇒ so sánh lẫn lộn).
- Kiểm tra chéo: **requester không được tự duyệt** (đã có) — giữ.
- Bổ sung: người duyệt phải **có scope** trên `ref` (`assertBusinessScope`).
- `propagateApproval` phải chạy trong **cùng tx** (đã có) và phải set `signed_date`.

### 5.3. P1-8 — Bỏ fallback `ORDER BY id DESC LIMIT 1` (đọc nhầm ID)

Xoá toàn bộ pattern `r.lastInsertRowid || (await c.get('SELECT id FROM … ORDER BY id DESC LIMIT 1'))?.id` trong:
`modules/finance/service.js:31,44`, `modules/sales/service.js:82`, `modules/supply/service.js:50,63,93`, `modules/helpdesk/service.js:30`, `modules/it/service.js:13`, `modules/qa/service.js:14`, `modules/marketing/service.js:24`, `modules/product/service.js` (nếu có), `routes/sales.js:22,58,71,88`, `routes/finance.js:113`, `routes/supply.js:62`.

**Thay bằng:** adapter `run()` đã trả `lastInsertRowid` đúng ở cả 2 dialect (DB-04) ⇒ dùng thẳng:
```js
const r = await c.run('INSERT …', [...]);
const id = r.lastInsertRowid;
if (!id) throw new AppError('INTERNAL', 'Khong lay duoc id ban ghi vua tao', 500);
```
Bổ sung assert trong `verify.js`: cấm regex `ORDER BY id DESC LIMIT 1` trong `src/**/*.js`.

### 5.4. P1-9 — `setOrderPaid` phải khoá dòng order

```js
async function setOrderPaid(conn, orderId, actor) {
  return withTx(async (c) => {
    const o = await c.lock('SELECT * FROM orders WHERE id=?', [orderId]);   // FOR UPDATE
    …
    const s = await c.get('SELECT COALESCE(SUM(amount),0) sum FROM payments WHERE order_id=?', [orderId]);
    …
  }, conn);
}
```
Tương tự: `markDebtCancelled`, `propagateApproval`, `runReconciliation` phải khoá dòng đích.

### 5.5. P1-10 — Storefront phải khoá tồn kho (chống oversell)

`backend/src/public/orders.js` hiện đọc `SELECT COALESCE(SUM(qty),0) FROM stock_moves` **không khoá**.

**Sửa:** dùng chính `supplyService.moveStock` (đã có `readOnhand` + `lock` + kiểm tra tồn) làm nguồn kiểm tra duy nhất:
1. **Bỏ** vòng kiểm tra tồn thủ công ở `public/orders.js` (chỉ kiểm tra *combo cấu hình*).
2. **Đặt trước** (reserve) tồn kho **trước** khi insert order, bằng cách gọi `supplyService.moveStock(c, { sku, type:'out', qty: -qty, ref_code: code, idempotency_key })` — `moveStock` **đã** kiểm tra tồn và sẽ ném `STOCK_SHORTAGE` (409) nếu thiếu, và **tx sẽ rollback toàn bộ** ⇒ không tạo đơn thiếu hàng.
3. **Combo**: với combo, trừ kho **thành phần** (`child_sku`) — code hiện đã làm vậy; giữ nguyên, nhưng bỏ kiểm tra tồn thủ công để tránh **kiểm tra trùng lệch** với `moveStock`.
4. **Thứ tự trong tx**: (a) tạo/đọc khách → (b) tính giá server-side → (c) insert order + items → (d) `moveStock` (khoá + kiểm tra) → (e) `createReceivable` → (f) `createShipment` → (g) ticket → (h) lookup token → (i) audit.
   > Nếu (d) ném 409 ⇒ rollback toàn bộ ⇒ khách thấy "hết hàng", không còn đơn ma.
5. **Lock thứ tự ổn định**: sắp xếp SKU theo thứ tự alphabet trước khi trừ (tránh deadlock trên PG) — như `sales/service.js` đã làm.

### 5.6. P1-11/12/13/14 — xem Phase 1 & Phase 2

### 5.7. P1-15 — `cashflow()` dùng SQL portable

```js
async function cashflow(conn) {
  const c = dbConn(conn, db);
  const rows = await c.query(
    "SELECT CAST(paid_at AS TEXT) d, " +
    "SUM(CASE WHEN debt_id IS NOT NULL THEN amount ELSE 0 END) thu, " +
    "SUM(CASE WHEN expense_id IS NOT NULL THEN amount ELSE 0 END) chi " +
    "FROM payments GROUP BY CAST(paid_at AS TEXT) ORDER BY d DESC LIMIT 30"
  );
  return rows;
}
```
> `CAST(x AS TEXT)` cho `'YYYY-MM-DD HH:mm:ss'` trên PG; trên SQLite cho `'YYYY-MM-DD HH:mm:ss'` — **định dạng khác nhau** ⇒ phải `SUBSTR(CAST(paid_at AS TEXT),1,10)` để chỉ lấy ngày:
```js
"SUBSTR(CAST(paid_at AS TEXT),1,10) d"
```
Bổ sung `GET /api/finance/cashflow` (đang có hàm nhưng **không có route**) — hoặc xoá hàm nếu không dùng (verify.js phải phản ánh).

### 5.8. P1-16 — xem Phase 1.3

### 5.9. P1-14 — Đưa **mọi** mutation về `tx` + `writeAudit`

Danh sách route **hiện ghi ngoài transaction / không audit**:

| Route | Sửa |
|---|---|
| `POST /api/employees` | đã có tx+audit ✔ |
| `POST /api/recruitments` | đã có ✔ |
| `POST /api/trainings` | **thêm tx + audit** |
| `POST /api/attendance/checkin`, `/checkout` | `hr/service.js` — bọc trong `tx`, truyền `conn` xuống `writeAudit` |
| `POST /api/customers` | đã có ✔ |
| `POST /api/leads` | **thêm tx + audit** |
| `POST /api/quotes` | **thêm tx + audit** |
| `POST /api/contracts` | **thêm tx + audit** |
| `POST /api/products` | **thêm tx + audit** |
| `POST /api/suppliers` | **thêm tx + audit** |
| `POST /api/qa-checks` | **thêm tx + audit** |
| `POST /api/sop-tasks` | **thêm tx + audit** |
| `POST /api/transactions` | **thêm tx + audit** |
| `POST /api/transactions/import-csv` | **1 tx cho cả lô** (hoặc tx/lô) + audit + báo cáo `imported` chính xác |
| `POST /api/expenses` | **tx + audit** (hiện 2 lệnh rời, không audit) |
| `POST /api/debts` | **tx + audit** (qua `financeService`, hiện `run()` rời) |
| `POST /api/budgets` | **tx + audit** + `enforceDept` |
| `POST /api/ratings` | **tx + audit** |
| `POST /api/campaigns` | **tx + audit** (service `marketing`) |
| `POST /api/risks`, `/it-incidents`, `/product-features` | **tx + audit** |
| `POST /api/leads/:id/convert` | đã có tx ✔ |

**Cách làm chuẩn (bắt buộc dùng cho tất cả):**
```js
const { tx } = require('../common/db');
const { writeAudit } = require('../common/audit');
const out = await tx(async (c) => {
  const r = await c.run('INSERT INTO …', [/* … */]);
  await writeAudit(c, req.user.username, 'create', 'leads', r.lastInsertRowid, null, { /* … */ });
  return { id: r.lastInsertRowid };
});
return ok(res, out);
```
Và **`common/audit.js` phải throw khi không có `conn`** (INV-2):
```js
async function writeAudit(conn, actor, action, table, recordId, oldJson, newJson) {
  if (!conn || typeof conn.run !== 'function') {
    throw new AppError('GOV', 'writeAudit phai chay trong transaction', 500);
  }
  …
}
```
> ⚠️ Kiểm tra lại mọi call-site hiện gọi `writeAudit` **ngoài tx** — sửa hết (đặc biệt `hr/service.js`).

### 5.10. P1-17/18/19/20/21 — các lỗi nhỏ

- **P2-17** lệch ngày → Phase 1.5.
- **P2-18** migrate nuốt lỗi → Phase 1.4.
- **P2-19** scope fail-open → Phase 4.1.
- **P2-20**:
  - `POST /api/transactions`: `ON CONFLICT(bank_ref) DO NOTHING` ⇒ báo `imported` sai. Sửa: dùng `INSERT … ON CONFLICT DO NOTHING RETURNING id` rồi đếm `changes === 1`; nếu 0 ⇒ trả `skipped`.
  - `import-csv`: đếm `imported` theo `changes`, `skipped` theo `duplicate`/`invalid` (phân biệt 2 nhóm).
  - `POST /api/expenses`: bỏ hardcode ngưỡng ⇒ Phase 5.1.
- **P2-21**:
  - `it/service.js setStatus`: thêm state machine `IT_FLOW = { open:['fixing','closed'], fixing:['resolved','closed'], resolved:['closed','open'], closed:['open'] }` ⇒ `SHIP_FLOW` style.
  - `qa/service.js create`: validate `ref_id` tồn tại theo `ref_type` (`orders`/`shipments`/`products`) + `assertBusinessScope`.
  - `campaigns`: thêm `dept_code` cột (migration) + `resource_dept`.
  - `product_features`, `risks`, `it_incidents`: thêm `dept_code` + `resource_dept`.

### 5.11. Bổ sung: **state machine đầy đủ** cho `orders`

`ORDER_FLOW` hiện chỉ là **mảng liệt kê**, không có transition. Bổ sung `docs/contract/state-machines.md` + code:
```js
const ORDER_FLOW = {
  draft:            ['pending_approval','pending','cancelled'],
  pending_approval: ['pending','cancelled','rejected'],
  pending:          ['approved','cancelled'],
  approved:         ['in_progress','cancelled'],
  in_progress:      ['done','cancelled'],
  done:             ['paid','partial'],
  partial:          ['paid','partial','refunded'],
  paid:             ['refunded'],
  cancelled:        [],
  refunded:         [],
};
function assertOrderTransition(from, to) {
  if (!(ORDER_FLOW[from] || []).includes(to)) {
    throw new AppError('VALIDATION', `Chuyen trang thai don ${from}->${to} khong hop le`, 400);
  }
}
```
Áp dụng cho `cancelOrder`, `refundOrder`, `setOrderPaid` (đặc biệt: `setOrderPaid` chuyển `in_progress → paid` khi chưa qua `done` ⇒ **bỏ qua bước giao hàng**).

---

## 6. PHASE 5 — P1-13 + BỔ SUNG: FRONTEND "HOÀN CHỈNH"

> Hiện tại FE **không có luồng refresh token** ⇒ hết 8h là mất phiên. Với `ACCESS_TTL` rút xuống 30m (Phase 2) thì **bắt buộc** phải có.

### 6.1. `frontend/src/api.js` — thêm refresh tự động + CSRF + hàng đợi

```js
let refreshing = null;
async function tryRefresh() {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': readCsrf() },
      body: '{}',
    }).then((r) => r.ok).catch(() => false).finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api(path, opts = {}, _retry = true) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(readCsrf() ? { 'X-CSRF-Token': readCsrf() } : {}),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (res.status === 401 && _retry && !path.startsWith('/api/auth/')) {
    if (await tryRefresh()) return api(path, opts, false);
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw Object.assign(new Error('Phi dang nhap da het'), { status: 401 });
  }
  const body = await res.json().catch(() => ({}));
  if (!body.ok) { /* … */ }
  return body.data;
}
```
- `readCsrf()` đọc cookie `csrf_token` (đọc được vì KHÔNG httpOnly).
- **Giữ nguyên `Idempotency-Key`** khi retry (hiện `...opts` spread **sau** `headers` ⇒ `opts.headers` bị ghi đè — kiểm tra lại thứ tự spread; `headers` phải merge sau `...opts`).

### 6.2. `frontend/src/App.jsx`
- Lắng nghe `auth:expired` ⇒ `setUser(null)` + toast "Phi dang nhap da het, vui long dang nhap lai".
- Hiển thị `user.dept_code` + phạm vi scope (đọc từ `/api/auth/me`).
- Sửa nhãn version `v6.1` ⇒ đọc từ `/api/health` (`version`).
- `canSeeTab` hiện dùng `.some()` ⇒ 1 quyền là đủ ⇒ **đổi sang `.every()`** để khớp backend (`requirePerm` cần **đủ** quyền của tab).

### 6.3. `frontend/src/api.js` — CSRF
- `POST /api/auth/login` phải lưu `csrf_token` từ response body vào cookie để FE đọc.

### 6.4. Storefront
- `storefront` dùng API public ⇒ **không** cần CSRF/refresh (đã đúng).
- Bảo đảm `storefront` **không** dùng cookie ERP.

---

## 7. PHASE 6 — HẠ TẦNG VẬN HÀNH & CI

### 7.1. CI thật sự chạy được 2 dialect

Sửa `.github/workflows/ci.yml`:
- Job `backend-postgres` hiện chạy `npm test` với `PG_HOST` ⇒ **bắt buộc phải xanh** sau Phase 1–5. Thêm bước:
  ```yaml
  - name: Kiểm tra dialect đồng bộ
    working-directory: backend
    run: node scripts/verify.js
  ```
- Job `pg-integration`: thêm `node scripts/audit-pg-fk.cjs src/db/migrations/001_init.postgres.sql` (đã có) + **chạy `npm run seed:storefront`** (sau khi sửa P1-16).
- Thêm job `frontend-build` chạy `npm run build` cho `frontend` và `storefront` (đã có — kiểm tra).
- Thêm job `contract-sync` kiểm tra 2 bản `roles-permissions.json`/`manifest.json` giống nhau.

### 7.2. `verify.js` — bổ sung assert (mục tiêu ≥ 400 assert)

| Nhóm | Assert |
|---|---|
| Dialect | 2 file migration có cùng tập bảng/cột; `created_by` là kiểu số; không có `date(<col>)`; không có `ORDER BY id DESC LIMIT 1`; không có `writeAudit` ngoài tx |
| Auth | `refresh` có `revoked_reason`; `revoke-all` **không** nằm trong tx (regex kiểm tra thứ tự); có `auth_version`; có `csrfGuard`; có `refreshLimiter`; `ACCESS_TTL` ≤ 30m |
| Scope | `scopeFilter` fail-closed; `RESOURCE_DEPT` **không còn giá trị `null`**; `resource_dept` tồn tại trong cả 2 migration; mọi route `GET` dùng scope (heuristic: file route nào chứa `SELECT * FROM` mà không có `scope`/`resource_dept` ⇒ FAIL) |
| Approval | `requestApproval` không nhận `level` từ client (regex); `decideApproval` có `lock(`; `UPDATE approvals` có `AND status='pending'`; ngưỡng đọc từ `approval-matrix.json` |
| Transaction | mọi route `POST`/`PATCH`/`DELETE` có `tx(` (heuristic) |
| Contract | 2 bản `roles-permissions.json` giống hệt; `manifest.json` khớp `traceability.csv`; mọi dòng trace có file test thật |

### 7.3. Bảo mật vận hành
- `docker-compose.yml`: thêm `read_only: true` + `no-new-privileges` cho `backend`/`agent` (nếu app không ghi file); thêm `cap_drop: [ALL]`.
- `backend/Dockerfile`: chạy với user không phải root.
- Rate-limit toàn hệ thống: giữ `apiLimiter` (ERP) tách khỏi `publicLimiter` (đã đúng) — nhưng **thêm** `trust proxy` đúng cho từng deployment: `TRUST_PROXY=loopback` khi nginx cùng host; nếu nginx ở máy khác ⇒ đặt đúng số hop.
- `.env.example`: bổ sung `TRUST_PROXY`, `COOKIE_SAMESITE`, `CSRF_ENABLED`, `ACCESS_TTL_MINUTES`, `REFRESH_DAYS`, `MAX_SESSIONS_PER_USER`.

### 7.4. Observability
- `common/logger.js`: thêm `request_id` vào mọi log dòng (đã có `req.requestId`).
- Log **mọi** quyết định RBAC 403 kèm `user`, `role`, `dept`, `resource` (giúp audit truy vết IDOR).
- `/api/ready` nên kiểm tra **cả** agent_svc (dependency) — trả `checks.agent`.

---

## 8. PHASE 7 — TÀI LIỆU & TRACEABILITY

- `README.md`: cập nhật kiến trúc, chạy 2 dialect, biến môi trường, quy trình release.
- `docs/contract/traceability.csv` (+ 2 bản trong `backend/` và `agent_svc/`): **thêm dòng** cho mọi hạng mục mới (`SEC-05` refresh session, `SEC-06` scope v2, `BUS-xx` bug nghiệp vụ, `PG-xx` dialect).
- `docs/contract/openapi.yaml` (+ 2 bản): thêm endpoint mới (`/api/auth/sessions`, `/api/auth/logout-all`, `/api/auth/refresh` response mới), ghi rõ header `X-CSRF-Token` và header `X-Scope-Depts`.
- `docs/08-security.md`: mô tả vòng đời refresh token mới, CSRF, session management.
- `docs/adr/`: thêm ADR cho các quyết định lớn (ADR-0012 refresh session, ADR-0013 resource_dept, ADR-0014 scope v2).
- `newpromt/AI_Agent_Company_v8_Audit_Stabilization_Report.md`: thêm phần "v8.1 delta" liệt kê P0-1 → P2-21 với trạng thái.

---

## 9. THỨ TỰ THỰC THI & GATE

```
Phase 0  (nền)          → verify xanh, npm test xanh, migrate idempotent 2 lần
Phase 1  (P0-1)         → PG chạy được: migrate+seed+test xanh trên PostgreSQL thật
Phase 2  (P0-2 + P1-11/12) → refresh token đúng vòng đời, reuse-detection CÓ HIỆU LỰC
Phase 3  (P0-3/4/5 + P2-19) → scope phòng ban enforce toàn hệ thống, test IDOR xanh
Phase 4  (P1-6..P1-21)  → nghiệp vụ đúng, mọi mutation có tx+audit
Phase 5  (P1-13)        → FE refresh + CSRF + scope hiển thị
Phase 6  (CI/ops)       → CI 11 job xanh, verify ≥ 400 assert
Phase 7  (docs)         → trace + openapi + README đồng bộ
```

**Không được đi lùi.** Mỗi Phase: sửa → `verify.js` → `npm test` → (nếu liên quan PG) `PG_* npm test` → commit.

---

## 10. CHECKLIST NGHIỆM THU CUỐI (copy để tick)

```markdown
- [ ] `node backend/scripts/verify.js` → 0 fail, ≥ 400 assert
- [ ] `cd backend && npm test` → # fail 0
- [ ] `cd backend && npm test` với PG_HOST=… → # fail 0
- [ ] `node src/db/migrate.js` chạy 2 lần → không lỗi, schema không đổi
- [ ] `node src/db/migrate.js --seed` chạy 2 lần → idempotent
- [ ] `npm run seed:storefront` chạy được trên CẢ SQLite và PostgreSQL
- [ ] Refresh reuse → 0 token active còn lại
- [ ] `POST /api/auth/refresh` bị limiter chặn khi flood
- [ ] Manager sales không đọc được đơn/phòng ban khác (test tự động)
- [ ] Đổi URL ID sang bản ghi phòng ban khác → 403
- [ ] Overview của kho/CSKH không chứa AR/DSO/headcount toàn công ty
- [ ] Expense 200tr tự khai `level:'leader'` → 400
- [ ] Double-approve cùng 1 approval → 409
- [ ] 20 đơn web đồng thời trên 1 SKU tồn 10 → không đơn nào oversell
- [ ] Mọi route POST/PATCH/DELETE có tx + audit (assert tự động)
- [ ] `created_by` luôn là số (assert tự động)
- [ ] CSRF: POST thiếu `X-CSRF-Token` → 403
- [ ] FE tự refresh khi 401 → không mất phiên sau 30'
- [ ] 11 job CI xanh
- [ ] Mọi dòng traceability.csv có file test thật
```

---

## 11. PHÂN HẠNG MỘT SỐ HẠNG MỤC

| Hạng mục | Vì sao bỏ qua (nếu bạn chọn) | Hậu quả |
|---|---|---|
| **CSRF double-submit** | Dùng `SameSite=strict` + Bearer token thay cookie | An toàn hơn nếu chuyển hẳn sang `Authorization: Bearer` (bỏ cookie) — nhưng phải sửa toàn bộ FE |
| **`resource_dept`** | Chấp nhận mô hình “mọi người đọc được đơn hàng” | Mất ý nghĩa phân quyền theo phòng ban — **không khuyến nghị** |
| **`auth_version`** | Chỉ cần thu hồi refresh token | Access token cũ vẫn sống tới 8h sau khi đổi mật khẩu |
| **Khoá dòng cho `setOrderPaid`** | Chấp nhận race hiếm | Trạng thái đơn có thể bị ghi đè khi 2 payment song song |
| **`ACCESS_TTL` 30m** | Giữ 8h | Rủi ro token lộ dài hơn — nhưng **phải** kèm FE refresh |

> **Khuyến nghị cuối:** **không bỏ Phase 0, Phase 1, Phase 2, Phase 3**. Đây là 4 chặng cửa khiến hệ thống *thực sự chạy được* ở production với đúng mô hình phân quyền mà bạn mô tả.

---

**Bắt đầu Phase 0.** Trước khi sửa, hãy chạy:
```bash
cd backend && node scripts/verify.js && npm test
```
rồi báo cáo: số assert, số test pass/fail, và output của `npm run migrate` chạy 2 lần.
