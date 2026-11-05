# BizOps AI v6.1 — ERP 100 nhan su (3 services: backend + frontend + agent_svc)

## Cau truc
- `backend/` — Express API :3000 (auth cookie httpOnly, 65+ routes, 1 cron scheduler, proxy `/api/cskh/chat` -> agent_svc:3100)
- `frontend/` — React 18 + Vite :5173 (11 tabs phong ban, fetch `credentials: include`)
- `agent_svc/` — AI agent HTTP :3100 (`/chat`, `/rag`, `/brief`, `/skills`, rule-engine + RAG top-3 + guardrail + 12 skills)
- `docs/` — tai lieu + hop dong duy nhat (`docs/contract/`: manifest 35 bang, enums, roles, approval-matrix v6.1, invariants, openapi, traceability). `backend/docs/contract` va `agent_svc/docs/contract` la ban copy phuc vu verify/test doc lap.
- `data/` — SQLite dung chung `bizops.db` (backend + agent doc qua `DATABASE_PATH=../data/bizops.db`)
- `prompts/` — lich su prompt xay dung (luu tru, khong chay runtime)

## Chay nhanh (dev) — mo 3 terminal
```bash
# terminal 1: backend
cd backend && cp .env.example .env 2>nul & npm install
npm run migrate        # SQLite dev + seed demo (admin/Admin@123)
npm run verify         # cong bat buoc: ALL PASS
npm test               # 35 tests
npm start              # http://localhost:3000/api/health

# terminal 2: agent
cd agent_svc && npm install
npm test               # 7/7 pass
node scripts/eval-chat.js   # PASS 100/100
npm start              # http://localhost:3100/health

# terminal 3: frontend
cd frontend && npm install
npm run dev            # http://localhost:5173
```

## Tai khoan demo (dev only)
- admin / Admin@123 (owner)
- ketoan / User@123 — kho / User@123 — sale / User@123 — cskh / User@123

## Prod (Postgres)
Dat `PG_HOST/PG_USER/PG_PASSWORD/PG_DB` + `JWT_SECRET` + `NODE_ENV=production` trong `backend/.env`, chay `npm run migrate` (khong seed).

## Quy uoc
- `backend/src/common/db.js` — 1 lop DB duy nhat (better-sqlite3 dev / pg prod), tien BIGINT, gio UTC, app hien thi Asia/Ho_Chi_Minh
- `backend/scripts/verify.js` — cong kiem soat drift (chay truoc moi phase)
- Tien BIGINT, gio UTC; AGENT_URL trong `backend/.env` tro toi agent_svc; `x-agent-key` dong bo 2 phia.
# AI_Agent_Company
