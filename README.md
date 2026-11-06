# BizOps AI v6.1 — ERP 100 nhan su + Storefront public (4 services)

## Cau truc
- `backend/` — Express API :3000 (auth cookie httpOnly, 65+ routes + `/api/public/*`, 1 cron scheduler, proxy `/api/public/chat` -> agent_svc:3100 `/public-chat`)
- `frontend/` — React 18 + Vite :5173 NOI BO (11 tabs phong ban, `credentials: include`, khong public internet)
- `agent_svc/` — AI agent HTTP :3100 (`/chat` noi bo + `/public-chat` cong khai voi `AGENT_PUBLIC_KEY` rieng, rule-engine + RAG top-3 + guardrail + 12 skills, `knowledge_public/` cho web)
- `storefront/` — React 18 + Vite + react-router :5174 PUBLIC (khach hang, khong auth NV, goi `/api/public/*`)
- `docs/` — tai lieu + hop dong duy nhat (`docs/contract/`: manifest 43 bang, enums, roles, approval-matrix v6.1, invariants I1-I8, openapi, traceability). `backend/docs/contract` va `agent_svc/docs/contract` la ban copy phuc vu verify/test doc lap.
- `data/` — SQLite dung chung `bizops.db` (backend + agent doc qua `DATABASE_PATH=../data/bizops.db`)
- `prompts/` — lich su prompt xay dung (luu tru, khong chay runtime)

## So do khep kin
```
Khach -> Storefront :5174 -> /api/public/* :3000 -> ERP (duyet -> kho/ke toan) -> CSKH
  catalog (products/services/banners/promos, gia server resolvePrice, combo explode tru kho thanh phan)
  checkout (orders + receivable + shipment + ticket + lookup_token) -> tra cuu 2 yeu to (ma DHW + SDT/email | X-Lookup-Token)
  thanh toan (COD / VietQR tinh + webhook HMAC -> pay_webhook_logs -> finance.recordPayment -> sales.setOrderPaid)
  chat (widget -> /api/public/chat -> agent /public-chat, knowledge_public, 0 leak cost/luong/ton so)
NV -> ERP :5173 -> backend :3000 (auth JWT + RBAC) | Agent noi bo :3100 /chat + /brief + /skills
```

## Chay nhanh (dev) — mo 4 terminal
```bash
# terminal 1: backend
cd backend && npm install
npm run migrate        # SQLite dev + seed demo (admin/Admin@123) + 002_storefront
npm run verify         # cong bat buoc: ALL PASS
npm test               # 48 tests (41 cu + 7 public-write P2/P3)
npm start              # http://localhost:3000/api/health

# terminal 2: agent
cd agent_svc && npm install
npm test               # 16/16 pass (7 cu + 9 public-chat P4)
node scripts/eval-chat.js         # PASS 100/100 (noi bo)
node scripts/eval-public-chat.js  # EVAL-PUBLIC: PASS 30/30, leaks=0
npm start              # http://localhost:3100/health

# terminal 3: frontend ERP noi bo
cd frontend && npm install
npm run dev            # http://localhost:5173

# terminal 4: storefront public
cd storefront && npm install
npm run dev            # http://localhost:5174
```

## Tai khoan demo (dev only)
- admin / Admin@123 (owner)
- ketoan / User@123 — kho / User@123 — sale / User@123 — cskh / User@123

## Env (secret chi env, khong commit)
- `backend/.env.example`: `JWT_SECRET` (prod fail-fast), `CORS_ORIGIN` (ERP + storefront), `AGENT_URL`, `AGENT_INTERNAL_KEY`, `AGENT_PUBLIC_KEY`, `WEBHOOK_SECRET` (HMAC webhook VietQR), `VIETQR_ACCOUNT` (hien thi QR).
- `agent_svc/.env.example`: `AGENT_INTERNAL_KEY` + `AGENT_PUBLIC_KEY` rieng kenh public, rate-limit prod 5p/10req.
- Prod dat `JWT_SECRET` + `WEBHOOK_SECRET` + `AGENT_PUBLIC_KEY` that, `NODE_ENV=production`.

## Docker (1 lenh)
```bash
cp backend/.env.example .env   # sua JWT_SECRET + WEBHOOK_SECRET + AGENT_*_KEY
docker compose up --build -d
docker compose logs -f
docker compose down
```
- backend :3000 (healthcheck `/api/health`) + agent :3100 (`/health`) + ERP :5173 bind `127.0.0.1` (noi bo) + storefront :5174 public, volume `./data:/data`.
- Xem `docker-compose.yml` + `*/Dockerfile`.

## Backup / restore / rollback 002
```bash
# SQLite: copy file (dung service truoc khi copy)
cp data/bizops.db backups/bizops-$(date +%F).db
# Postgres prod:
pg_dump -h $PG_HOST -U $PG_USER $PG_DB > backups/bizops-$(date +%F).sql
# Rollback 002_storefront (can than — mat bang public):
# sqlite: ALTER/DROP bang services/service_requests/order_lookup_tokens/pay_webhook_logs/banners/promotions/product_combos/product_prices (gi revisi tay + xoa cot slug/... khoi products)
```

## Quy uoc
- `backend/src/common/db.js` — 1 lop DB duy nhat (better-sqlite3 dev / pg prod), tien BIGINT, gio UTC, app hien thi Asia/Ho_Chi_Minh
- `backend/scripts/verify.js` — cong kiem soat drift (chay truoc moi phase)
- Tien BIGINT, gio UTC; `x-agent-key` dong bo 2 phia (internal vs public key rieng).
