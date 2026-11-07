# 10 — Operations v8.1

## 1. Lệnh chuẩn

```powershell
cd backend
npm ci && npm run migrate && npm run seed:storefront && npm run verify && npm test && npm start
```

> `npm run migrate` **idempotent** — chạy 2 lần không đổi schema (có gate CI
> `pg-integration` chạy `migrate` ×2 + `seed` ×2).

## 2. Múi giờ

- Múi giờ chốt **Asia/Ho_Chi_Minh** cho cron / SLA / khung nhắc / chấm công.
- DB lưu **UTC**; hiển thị và logic giờ quy đổi ở tầng ứng dụng
  (`todayVN()`, `businessDayVN()`, `nowISO()`, `toSqlDateTime()`).
- ⚠️ Cấm dùng `CURRENT_TIMESTAMP` cho logic nghiệp vụ (múi giờ DB ≠ giờ VN);
  cấm `date(<col>)` (SQLite-only) — dùng `substr(CAST(<col> AS TEXT),1,10)`.

## 3. Backup & khôi phục

| Môi trường | Cơ chế | Tần suất |
|---|---|---|
| SQLite (dev) | `.backup` (đúng WAL) | 2h sáng |
| PostgreSQL (prod) | `pg_dump` → volume `bizops-backups` | `BACKUP_CRON` (mặc định `0 3 * * *`) |
| Retention | `BACKUP_RETENTION_DAYS` (mặc định 14 ngày) | — |

- **Restore drill** tự động: `backend/scripts/restore-drill.sh` — restore vào DB
  riêng rồi verify. Chạy **hằng tuần** (không chỉ khi có sự cố).
- ⚠️ Backup mà không restore thử là **không có backup**.

## 4. Health & readiness

| Endpoint | Ý nghĩa | Khi nào fail |
|---|---|---|
| `GET /api/health` | Liveness — process còn sống | Không bao giờ (trừ process chết) |
| `GET /api/ready` | Readiness — DB (**bắt buộc**) + agent (`checks.agent`) | 503 khi DB lỗi; `degraded` khi agent offline |

- Docker healthcheck dùng `/api/ready` (không dùng `/api/health`) để orchestrator
  không coi service "sẵn sàng" khi DB chưa sẵn sàng.
- Agent offline ⇒ `status: 'degraded'` (vẫn 200) để **không** restart-loop backend.

## 5. Observability (Phase 6)

- **Mọi dòng log có `[rid=...]`** (request id) — truy vết 1 request xuyên suốt
  frontend → nginx → backend → agent.
- **Mọi quyết định 403 đều được log** kèm `user`, `role`, `dept`, `resource`
  (RBAC lẫn scope) ⇒ truy vết được IDOR và "sai quyền".
- Log file theo **ngày VN**: `logs/app-YYYY-MM-DD.log`.
- Response có header `X-Request-Id` để đối chiếu với log.

## 6. Hardening container (Phase 6)

| Thiết lập | Giá trị | Vì sao |
|---|---|---|
| `USER` | user không phải root | giảm bề mặt tấn công |
| `cap_drop` | `[ALL]` | không cần quyền Linux nào |
| `security_opt` | `no-new-privileges:true` | không escalate được |
| `read_only` | `true` | app không ghi file ngoài volume `./logs` |
| `tmpfs` | `/tmp` | writable tạm, không chạm fs gốc |

## 7. Checklist production

- [ ] `JWT_SECRET`, `AGENT_INTERNAL_KEY`, `AGENT_PUBLIC_KEY`, `WEBHOOK_SECRET`
      ≥ 32 ký tự, **fail-fast** nếu thiếu; 2 key agent **khác nhau**.
- [ ] `PG_PASSWORD` đặt trong `.env`; **không** dùng SQLite ở production.
- [ ] Cấm seed tự động (`ALLOW_AUTO_SEED` không bật); cấm `x-user-code`.
- [ ] `TRUST_PROXY` đúng topology: `loopback` (nginx cùng host) · `1` · `2`.
      **Không** đặt `true` khi có nhiều proxy (sẽ vô hiệu rate-limit).
- [ ] `COOKIE_SAMESITE` đúng: `lax` (SPA cùng site) · `none` (cross-site + HTTPS).
- [ ] `CSRF_ENABLED=1` — CSRF guard bắt buộc bật ở production.
- [ ] `helmet` + CSP (cấm inline script, cấm JWT trong `localStorage`).
- [ ] Rate-limit: ERP `apiLimiter`, storefront `publicLimiter` (bucket riêng),
      login `loginLimiter` + `loginUserLimiter`, `refreshLimiter`, `chatLimiter`.
- [ ] Cookie `httpOnly` + `secure` (production); `csrf_token` **không** httpOnly.
- [ ] Backup chạy + **restore drill đã chạy thành công** ≥ 1 lần trong 30 ngày.
- [ ] `docker compose run --rm migrate` chạy **trước** khi `up -d`.
- [ ] `/api/ready` = 200 sau deploy.

## 8. Cron duy nhất

Cron **chỉ** ở `backend/src/common/scheduler.js` (4 dòng). `verify.js` chặn
`cron.schedule` / `setInterval` ở mọi file khác.

| Lịch | Việc |
|---|---|
| 8h05 VN | Agent brief + nhắc nợ (`reminder_log`, khung 8h–20h VN) |
| Hằng ngày | Tổng hợp kho / công nợ |

## 9. Danh sách hạng mục còn nợ (không phải lỗi)

| Hạng mục | Ảnh hưởng | Hướng xử lý |
|---|---|---|
| NAT đổi IP | chỉ ghi cảnh báo, không chặn (đã chọn fail-open ở điểm này) | chấp nhận — ưu tiên khả dụng |
| UA đổi (trình duyệt update) | reuse detection ⇒ thu hồi toàn bộ phiên ⇒ buộc đăng nhập lại | chấp nhận — fail-secure |
| `resource_dept` khi thêm module mới | bản ghi mới phải gọi `setBusinessScope` | gate `verify.js` + ADR-0013 |
| Chi phí khoá dòng trên PG khi tải cao | `SELECT … FOR UPDATE` giữ lock lâu hơn | cân nhắc partition theo tenant |
