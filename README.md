# BizOps AI — ERP + Agent/RAG cho doanh nghiệp nhỏ vừa

Nền tảng vận hành doanh nghiệp: **ERP nhiều phòng ban** (Backend API + ERP
Frontend + Storefront) và **Agent service** (rule engine + RAG + 12 skills).
Không phụ thuộc Zalo/FB, tự host bằng Docker Compose.

> **Trạng thái:** `v11.1` — *Enterprise Hardening* (đóng toàn bộ P0 → P2 của
> audit v8.1: Phase 0–7). Xem `newpromt/AI_Agent_Company_v8.1_Enterprise_Hardening_Prompt.md`,
> `docs/contract/` và `docs/adr/` cho hợp đồng nghiệp vụ + quyết định thiết kế.

---

## 1. Kiến trúc

```text
                    ┌──────────────┐   ┌────────────────┐
                    │   ERP UI     │   │  Storefront    │
                    │ (frontend)   │   │  (public web)  │
                    └──────┬───────┘   └───────┬────────┘
                           │  nginx /api proxy  │
                    ┌──────▼───────────────────▼────────┐
                    │        Backend API (Express)      │
                    │  auth · O2C · P2P · finance · HR  │
                    │  helpdesk · marketing · overview   │
                    └──────┬───────────────────┬────────┘
                           │                   │
                  ┌────────▼──────┐   ┌────────▼────────┐
                  │  PostgreSQL  │   │  Agent service  │
                  │     15       │   │ rule + RAG+skill│
                  └──────────────┘   └─────────────────┘
```

| Thành phần | Thư mục | Cổng | Vai trò |
|---|---|---|---|
| Backend API | `backend/` | 3000 | Toàn bộ nghiệp vụ + auth + RBAC + scope phòng ban |
| ERP Frontend | `frontend/` | 5173 | 11 tab theo quyền (CEO/Sales/Finance/Ops/CSKH/Marketing/HR/IT/Legal/QA/Product) |
| Storefront | `storefront/` | 5174 | Website bán hàng công khai, checkout idempotent |
| Agent service | `agent_svc/` | 3100 | Chatbot CSKH, RAG, 12 skill, brief 8h05 |
| Contract docs | `docs/contract/` | — | manifest, RBAC matrix, ownership, openapi, traceability, invariants |
| ADR | `docs/adr/` | — | Quyết định thiết kế lớn (0012–0015) |

## 2. Chạy nhanh (dev, SQLite)

```powershell
cd backend
npm install
npm run migrate        # tao schema + schema_migrations (idempotent)
npm run seed:storefront
npm start              # http://localhost:3000
```

Kiểm tra chất lượng trước khi commit:

```powershell
cd backend
npm run verify         # 688 assertion: schema, RBAC, scope, dialect, tx/audit, contract-sync
npm test               # 110 test (SQLite), concurrency=1
```

## 3. Chạy production (Docker Compose + PostgreSQL 15)

```powershell
copy .env.example .env   # set PG_PASSWORD, JWT_SECRET, AGENT_*, WEBHOOK_SECRET
docker compose up -d --build
docker compose run --rm migrate
```

Compose dựng: `postgres` (volume `bizops-pgdata`), release job `migrate`,
`backend`, `agent`, `frontend`, `storefront`, `backup` (volume `bizops-backups`).

| Mục | Chi tiết |
|---|---|
| DB | PostgreSQL 15, persistent volume `bizops-pgdata` — **không** dùng file SQLite ở production |
| Migration | job `migrate` chạy 1 lần / release (`docker compose run --rm migrate`) |
| Readiness | `GET /api/ready` kiểm tra DB thật (503 khi DB lỗi) **+ agent** (`checks.agent`, `degraded` khi agent offline); liveness `GET /api/health` |
| Proxy | Nginx của `frontend` + `storefront` reverse proxy `/api` → `backend:3000` |
| Backup | service `backup` chạy theo `BACKUP_CRON`, ghi vào volume `bizops-backups` (pg_dump + retention) |
| Restore drill | `backend/scripts/restore-drill.sh` — restore vào DB riêng rồi verify |
| Expose | backend chỉ bind `127.0.0.1:3000` (không public trực tiếp ra internet) |
| Hardening | container chạy **user không phải root**, `cap_drop: [ALL]`, `read_only: true`, `no-new-privileges:true`, `tmpfs: /tmp` |

## 4. Bảo mật (v8.1)

| Hạng mục | Thực hiện |
|---|---|
| RBAC server-side | `requirePerm()` theo `roles-permissions.json`; `requireScoped()` theo phòng ban (fail-closed) |
| Scope phòng ban | `resource_dept` là nguồn sự thật duy nhất; `assertBusinessScope` chặn IDOR (đổi `:id` → 403); header `X-Scope-Depts` để audit — xem ADR-0013/0014 |
| Refresh token | TTL access 30 phút; xoay token **atomic**; phát hiện tái sử dụng → thu hồi **toàn bộ** session; quản lý phiên (`/api/auth/sessions`, `/logout-all`) — ADR-0012 |
| CSRF | Double-submit cookie `csrf_token` + header `X-CSRF-Token` (timing-safe) cho mọi mutation |
| Proxy trust | `TRUST_PROXY` cấu hình theo topology; không tin `X-Forwarded-For` do client giả; rate-limit dùng `req.ip` đã resolve |
| Cookie | `httpOnly` + `secure` (production) + `sameSite`; `clearCookie` dùng đúng thuộc tính lúc set |
| Secret | Fail-fast lúc boot nếu thiếu `JWT_SECRET`/`AGENT_*`/`WEBHOOK_SECRET` ở production |
| Audit | Ghi trong **cùng transaction** với mutation (thiếu `conn` ⇒ 500); `audit_log` append-only (trigger chặn UPDATE/DELETE) |
| Observability | Mọi dòng log có `[rid=...]`; mọi quyết định 403 (RBAC + scope) đều log kèm `user/role/dept/resource` |

## 5. Toàn vẹn giao dịch & nghiệp vụ (v8.1)

| Hạng mục | Thực hiện |
|---|---|
| Stock | Khoá theo SKU (`SELECT … FOR UPDATE` trên PG) + SKU alphabet ⇒ không oversell, không deadlock |
| Payment | Khoá dòng công nợ + `UPDATE … WHERE paid = ?` ⇒ không overpayment / double-credit |
| Idempotency | `UNIQUE(idempotency_key)` + bắt lỗi UNIQUE ⇒ retry cùng key trả về đúng bản ghi cũ |
| Transaction | SQLite serialize bằng mutex + `AsyncLocalStorage`; `BEGIN IMMEDIATE` tránh `SQLITE_BUSY` |
| Insert ID | `insertedId()` — **cấm** `ORDER BY id DESC LIMIT 1` sau INSERT (có thể trả ID của giao dịch khác) |
| State machine | `ORDER_FLOW` / `TICKET_FLOW` / `SHIP_FLOW` / `IT_FLOW` — chuyển sai ⇒ 400, không update lệch; thanh toán đủ khi chưa giao xong **phải qua `partial` trước `paid`** — ADR-0015 |
| Cấp duyệt | `approval-matrix.json` là nguồn sự thật; client **không được ép cấp** (400) |
| Storefront | Đặt trước tồn kho atomic trong 1 tx (`moveStock`) ⇒ hết hàng ⇒ 409 và **không** tạo đơn mồ côi |

## 6. Test

| Bộ test | Vị trí | Phủ |
|---|---|---|
| Nghiệp vụ | `backend/tests/` | order→stock→debt→shipment, payment, approval, reconcile, HR, RBAC, audit, P2P, SLA |
| Concurrency | `backend/tests/tx-concurrency.test.js`, `race-concurrency.test.js` | oversell, overpayment, idempotency, insert-ID |
| Security | `backend/tests/security-regression.test.js` | scope/IDOR, refresh race + reuse, proxy spoof, cookie |
| Scope v2 | `backend/tests/scope-v2.test.js` | sec01d..sec01k — phòng ban, IDOR, overview, audit, fail-closed |
| Phase 4 | `backend/tests/phase4.test.js` | p401..p408 — approval matrix, state machine, atomic stock, tx/audit |
| Phase 5 | `backend/tests/phase5.test.js` | p501..p506 — refresh cookie, CSRF guard, reuse detection, scope |
| Phase 6 | `backend/tests/phase6.test.js` | p601..p606 — readiness, request_id, RBAC log, contract-sync |
| Agent | `agent_svc/tests/` | chat rule, public chat, debt leak, availability |
| Storefront | `storefront/scripts/e2e-idempotency.cjs` | 5 request cùng key → 1 đơn |

```powershell
cd backend  ; npm test
cd agent_svc; npm test
```

CI (`.github/workflows/ci.yml`): backend SQLite + backend PostgreSQL + agent +
frontend build + storefront build/bundle-budget + E2E idempotency + browser E2E +
race/security suite riêng + pg-integration + docker-smoke + **contract-sync**.

## 7. Hợp đồng nghiệp vụ

`docs/contract/` là nguồn sự thật (**3 bản phải giống hệt**: `docs/`, `backend/docs/`, `agent_svc/docs/`):

- `manifest.json` — bảng, quy ước tiền (BIGINT), 12 phòng ban
- `enums.json` — trạng thái hợp đồng (`order_status`, `ship_status`, …)
- `roles-permissions.json` — ma trận quyền + `role_scopes` theo phòng ban
- `table-ownership.json` — bảng nào thuộc module nào (verify chặn ghi chéo)
- `approval-matrix.json` — quy trình duyệt (không tự duyệt, không ép cấp)
- `state-machines.md` — bảng transition (orders, debts, shipments, tickets, IT, approvals)
- `openapi.yaml` — hợp đồng HTTP (kèm `X-CSRF-Token`, `X-Scope-Depts`, `X-Request-Id`)
- `traceability.csv` — story → API → bảng → test → UI
- `invariants.sql` — kiểm tra toàn vẹn (tồn kho âm, thanh toán trùng, audit thiếu…)

## 8. Cấu trúc thư mục

```text
backend/     API + migrations + tests + scripts (verify/backup/restore)
agent_svc/   Agent service (rule, RAG, skills) + eval scripts
frontend/    ERP React (11 tab)
storefront/  Website bán hàng React + Nginx
docs/        contract docs (single source of truth) + adr/
scripts/     tooling repo (audit/fix/patch helpers)
newpromt/    prompt + audit report
```

## 9. Lệnh hay dùng

```powershell
# Backend
cd backend
npm run migrate        # migrate (idempotent)
npm run seed:demo      # seed demo (explicit, KHÔNG auto-seed ở production)
npm run seed:storefront
npm run verify         # quality gate (688 assert)
npm test               # test suite (110 test)

# Agent
cd agent_svc
npm test
npm run eval

# Storefront
cd storefront
npm run build
npm run check:bundle   # budget 150 kB gzip
npm run e2e:idempotency http://127.0.0.1:3000

# Docker
docker compose up -d --build
docker compose run --rm migrate
docker compose exec backup bash scripts/restore-drill.sh
```

## 10. Biến môi trường quan trọng

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `PG_HOST` `PG_USER` `PG_PASSWORD` `PG_DB` | production | Khi có `PG_HOST` → dùng PostgreSQL, ngược lại SQLite |
| `JWT_SECRET` | production | ≥ 32 ký tự, fail-fast nếu thiếu |
| `AGENT_INTERNAL_KEY` `AGENT_PUBLIC_KEY` | production | Khoá nội bộ giữa backend ↔ agent (2 key phải khác nhau) |
| `WEBHOOK_SECRET` | production | HMAC webhook thanh toán |
| `TRUST_PROXY` | theo topo | `loopback` (mặc định) · `1` · `2` · `false` — **không** đặt `true` khi nhiều proxy |
| `CORS_ORIGIN` | có | Danh sách origin, phân tách bằng dấu phẩy |
| `COOKIE_SAMESITE` | không | `lax` (mặc định) · `strict` · `none` (cần HTTPS) |
| `CSRF_ENABLED` | không | `1` (mặc định) — bật CSRF guard cho mutation |
| `ACCESS_TTL` | không | TTL access token, mặc định `30m` |
| `REFRESH_DAYS` | không | TTL refresh token, mặc định `7` |
| `MAX_SESSIONS_PER_USER` | không | Số phiên đồng thời tối đa, mặc định `5` |
| `APP_VERSION` | không | Version hiển thị (nguồn duy nhất qua `/api/health`) |
| `BACKUP_CRON` `BACKUP_RETENTION_DAYS` | không | Lịch backup + retention (mặc định `0 3 * * *`, 14 ngày) |

## 11. Quy trình release

1. `cd backend && npm run verify && npm test` — phải xanh toàn bộ.
2. `cd agent_svc && npm test` — phải xanh.
3. `npm run build` ở `frontend/` + `storefront/` (storefront còn phải qua `check:bundle`).
4. Commit — CI chạy 12 job (SQLite, PostgreSQL, agent, FE, SF, E2E, browser E2E, race,
   security, pg-integration, docker-smoke, contract-sync).
5. `docker compose run --rm migrate` (migrate idempotent — chạy lại 2 lần vẫn an toàn).
6. `docker compose up -d --build` — kiểm tra `GET /api/ready` = 200.
7. Smoke: đăng nhập, tạo đơn, ghi công nợ, duyệt, thanh toán, đối soát.
8. Nếu cần rollback dữ liệu: `docker compose exec backup bash scripts/restore-drill.sh`.
