# 01 — Quy chuẩn kỹ thuật v6 (bắt buộc)

## 1. Cấu trúc repo v6
```
docs/contract/ (manifest, enums, roles-permissions, state-machines, approval-matrix, openapi.yaml, traceability.csv, invariants.sql, table-ownership.json)
docs/adr/ (0005, 0011)
src/common/db.js (1 lớp DB duy nhất, async) + logger/errors/auth/audit/validate/security/scheduler.js
src/modules/<ban>/service.js + src/routes/<ban>.js + tests/<ban>.test.js
src/agent/skills/*.js + agent.js
public/js/tabs/*.js + core/auth/router
scripts/verify.js + backup.sh | tests/fixtures/ (statement.csv, chat-cases-100.json)
```
Cấm: 2 lớp DB, cron ngoài scheduler.js, route 40 vào server.js, 1 file HTML 1800 dòng, số tay (bảng/SLA/role).

## 2. Git
main/develop/feature/*, commit `feat(sales): ...`, cấm push khi verify/test đỏ.

## 3. DB
BIGINT đồng, TIMESTAMP UTC + Asia/Ho_Chi_Minh hiển thị, ON CONFLICT DO NOTHING, migration per-dialect (001_init.sql + .postgres.sql), seed chỉ dev (`npm run seed:demo`, cấm seed prod).

## 4. Backend
REST {ok:true,data}, JWT (access 8h + refresh xoay vòng trong refresh_tokens) + RBAC từ roles-permissions.json + lọc field backend, helmet + trust proxy + rate-limit, Idempotency-Key cho POST orders/payments, state-machine mọi chuyển trạng thái, tx + writeAudit(conn,...) mọi write tiền/kho/duyệt.

## 5. Chất lượng
`npm run verify` ALL PASS + test xanh mới được merge. P0 ≥6 test (không đòi 15). Mỗi module: happy + edge + invariant liên quan. CI chạy SQLite + Postgres.
