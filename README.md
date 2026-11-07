# BizOps AI — ERP + Agent/RAG cho doanh nghiệp nhỏ vừa

Nền tảng vận hành doanh nghiệp: **ERP nhiều phòng ban** (Backend API + ERP
Frontend + Storefront) và **Agent service** (rule engine + RAG + 12 skills).
Không phụ thuộc Zalo/FB, tự host bằng Docker Compose.

> **Trạng thái:** `v8.0.0` — *Stabilization* (đóng các blocker P0/P1 của
> audit v8.0). Xem `newpromt/AI_Agent_Company_v8_Audit_Stabilization_Report.md`
> và `docs/contract/` cho hợp đồng nghiệp vụ.

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
| Backend API | `backend/` | 3000 | Toan bo nghiệp vụ + auth + RBAC |
| ERP Frontend | `frontend/` | 5173 | 11 tab theo quyền (CEO/Sales/Finance/Ops/CSKH/Marketing/HR/IT/Legal/QA/Product) |
| Storefront | `storefront/` | 5174 | Website bán hàng công khai, checkout idempotent |
| Agent service | `agent_svc/` | 3100 | Chatbot CSKH, RAG, 12 skill, brief 8h05 |
| Contract docs | `docs/contract/` | — | manifest, RBAC matrix, ownership, openapi, traceability, invariants |

## 2. Chạy nhanh (dev, SQLite)

```powershell
cd backend
npm install
npm run migrate        # tao schema + schema_migrations
npm run seed:storefront
npm start              # http://localhost:3000
```

Kiểm tra chất lượng trước khi commit:

```powershell
cd backend
npm run verify         # ~180 assertion: schema, RBAC, ownership, SQL dialect, gate v8.0
npm test               # 78 test (SQLite), concurrency=1
```

## 3. Chạy production (Docker Compose + PostgreSQL 15)

```powershell
copy .env.example .env   # set PG_PASSWORD, JWT_SECRET, AGENT_*, WEBHOOK_SECRET
docker compose up -d --build
```

Compose dựng: `postgres` (volume `bizops-pgdata`), release job `migrate`,
`backend`, `agent`, `frontend`, `storefront`, `backup` (volume
`bizops-backups`).

| Mục | Chi tiết |
|---|---|
| DB | PostgreSQL 15, persistent volume `bizops-pgdata` — **không** dùng file SQLite ở production |
| Migration | job `migrate` chạy 1 lần / release (`docker compose run --rm migrate`) |
| Readiness | `GET /api/ready` kiểm tra kết nối DB thật (503 khi DB lỗi); liveness `GET /api/health` |
| Proxy | Nginx của `frontend` + `storefront` reverse proxy `/api` → `backend:3000` |
| Backup | service `backup` chạy theo `BACKUP_CRON`, ghi vào volume `bizops-backups` (pg_dump + retention) |
| Restore drill | `backend/scripts/restore-drill.sh` — restore vào DB riêng rồi verify |
| Expose | backend chỉ bind `127.0.0.1:3000` (không public trực tiếp ra internet) |

## 4. Bảo mật (v8.0)

| Hạng mục | Thực hiện |
|---|---|
| RBAC server-side | `requirePerm()` theo `roles-permissions.json`; `scope.js` chặn truy cập chéo phòng ban và IDOR (đổi `:id` → 403) |
| Refresh token | Xoay token **atomic** (`UPDATE ... WHERE revoked IS NOT TRUE`); phát hiện tái sử dụng → vô hiệu hoá toàn bộ session của user |
| Proxy trust | `TRUST_PROXY` cấu hình theo topology; không tin `X-Forwarded-For` do client giả; rate-limit dùng `req.ip` đã resolve |
| Cookie | `httpOnly` + `secure` (production) + `sameSite=lax`; `clearCookie` dùng đúng thuộc tính lúc set |
| Secret | Fail-fast lúc boot nếu thiếu `JWT_SECRET`/`AGENT_*`/`WEBHOOK_SECRET` ở production |
| Audit | Ghi trong **cùng transaction** với mutation; `audit_log` append-only (trigger chặn UPDATE/DELETE) |

## 5. Toàn vẹn giao dịch (v8.0)

| Hạng mục | Thực hiện |
|---|---|
| Stock | Khoá theo SKU (`SELECT … FOR UPDATE` trên PG) → không oversell khi 2 đơn chạy song song |
| Payment | Khoá dòng công nợ + `UPDATE … WHERE paid = ?` (so khớp giá trị cũ) → không overpayment / double-credit |
| Idempotency | `UNIQUE(idempotency_key)` + bắt lỗi UNIQUE → retry cùng key trả về đúng bản ghi cũ |
| Transaction | SQLite serialize bằng mutex + `AsyncLocalStorage` (chống cross-request contamination); `BEGIN IMMEDIATE` tránh `SQLITE_BUSY` khi nâng cấp write-lock |

## 6. Test

| Bộ test | Vị trí | Phủ |
|---|---|---|
| Nghiệp vụ | `backend/tests/` | order→stock→debt→shipment, payment, approval, reconcile, HR, RBAC, audit, P2P, SLA |
| Concurrency | `backend/tests/tx-concurrency.test.js`, `backend/tests/race-concurrency.test.js` | oversell, overpayment, idempotency, insert-ID |
| Security | `backend/tests/security-regression.test.js` | scope/IDOR, refresh race + reuse, proxy spoof, cookie |
| Agent | `agent_svc/tests/` | chat rule, public chat, debt leak, availability |
| Storefront | `storefront/scripts/e2e-idempotency.cjs` | 5 request cùng key → 1 đơn |

```powershell
cd backend  ; npm test
cd agent_svc; npm test
```

CI (`.github/workflows/ci.yml`): backend SQLite + backend PostgreSQL + agent +
frontend build + storefront build/bundle-budget + E2E idempotency.

## 7. Hợp đồng nghiệp vụ

`docs/contract/` là nguồn sự thật:

- `manifest.json` — bảng, quy ước tiền (BIGINT), 12 phòng ban
- `enums.json` — trạng thái hợp đồng (`order_status`, `ship_status`, …)
- `roles-permissions.json` — ma trận quyền + `role_scopes` theo phòng ban
- `table-ownership.json` — bảng nào thuộc module nào (verify chặn ghi chéo)
- `approval-matrix.json` — quy trình duyệt (không tự duyệt)
- `openapi.yaml` — hợp đồng HTTP
- `traceability.csv` — story → API → bảng → test → UI
- `invariants.sql` — kiểm tra toàn vẹn (tồn kho âm, thanh toán trùng, audit thiếu…)

## 8. Cấu trúc thư mục

```text
backend/     API + migrations + tests + scripts (verify/backup/restore)
agent_svc/   Agent service (rule, RAG, skills) + eval scripts
frontend/    ERP React (11 tab)
storefront/  Website bán hàng React + Nginx
docs/        contract docs (single source of truth)
scripts/     tooling repo (audit/fix/patch helpers)
newpromt/    prompt + audit report
```

## 9. Lệnh hay dùng

```powershell
# Backend
cd backend
npm run migrate        # migrate (idempotent)
npm run seed:demo      # seed demo (explicit, KHONG auto-seed ở production)
npm run seed:storefront
npm run verify         # quality gate
npm test               # test suite

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
| `AGENT_INTERNAL_KEY` `AGENT_PUBLIC_KEY` | production | Khoá nội bộ giữa backend ↔ agent |
| `WEBHOOK_SECRET` | production | HMAC webhook thanh toán |
| `TRUST_PROXY` | theo topo | `loopback` (mặc định) · `1` · `false` |
| `CORS_ORIGIN` | có | Danh sách origin, phân tách bằng dấu phẩy |
| `COOKIE_SAMESITE` | không | `lax` (mặc định) · `strict` · `none` |
| `BACKUP_CRON` `BACKUP_RETENTION_DAYS` | không | Lịch backup + retention (mặc định `0 3 * * *`, 14 ngày) |
