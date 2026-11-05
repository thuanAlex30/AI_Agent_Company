# PROMPT 02a v6.1 — NỀN MÓNG (P0: 1 lớp DB, auth thật, verify, CI)

> Precondition: 01 v6.1 migrate xanh.

```Prompt
# 1. PRECONDITIONS: `npm run migrate` + `node scripts/verify.js` xanh. Dán output. Đọc docs/contract/manifest.json (conventions ở manifest.conventions), enums.json (roles đủ 14 gồm legal/hr), roles-permissions.json, approval-matrix.json v6.1, ADR-0011.
# 2. EXPORTS
- `src/common/db.js` (đã có từ 01 — chỉ hoàn thiện): {query,get,all,run,tx} async, helper nowVN()/todayVN() (Asia/Ho_Chi_Minh, DB lưu UTC), comment trust-proxy.
- `src/common/{logger.js,errors.js,auth.js,audit.js,validate.js,security.js}` + `src/server.js` KHUNG (chỉ /health + errorHandler, cấm nhồi route).
- `src/common/scheduler.js` KHUNG rỗng (02d-1 mới điền — cấm cron ở file khác, verify fail nếu có).
- `tests/{setup.js,auth.test.js,audit.test.js}` + `.github/workflows/ci.yml` (matrix sqlite + postgres service) + `scripts/backup.sh` + README + .gitignore.
# 3. ĐẶC TẢ
- Auth THẬT (module auth sở hữu users + refresh_tokens; hr KHÔNG write 2 bảng này): POST /api/auth/login {username,password} → bcrypt + lock 5 sai/15p + JWT access 8h; POST /api/auth/refresh (lưu refresh_tokens hash, xoay vòng + thu hồi); POST /api/auth/logout (revoke); GET /api/auth/me (trả user + permissions từ roles-permissions.json). fail-fast: thiếu JWT_SECRET khi NODE_ENV=production → crash lúc boot. x-user-code: chỉ khi NODE_ENV!=production + log warn; verify fail nếu thấy ở prod.
- requirePerm(resource.action) đọc roles-permissions.json (ma trận đủ: approvals.decide/request/read, attendance.checkin '*', users.unlock, chat.write, customers/quotes/leads.write...); lọc field salary_base/password_hash ở backend theo field_filter (không chỉ ẩn UI). Role đọc từ enums.json roles.
- writeAudit(conn, actor, action, table, recordId, old, new) — BẮT BUỘC nhận conn trong tx.
- security: helmet, cors whitelist, rate-limit (login 10/15p, api 300/15p, trust proxy bật), json 1mb, multer CSV ≤2MB, requestId, query tham số hóa 100%.
- migrate không seed khi prod; seed chỉ `npm run seed:demo` tay ở dev (không còn CEO123! trong code).
- backup.sh: sqlite `.backup` (đúng WAL, cấm .dump) + pg_dump prod + test restore hằng tuần; cron ghi chú (không chạy ở đây).
# 4. CẤM: 2 lớp DB, cron ngoài scheduler.js, seed ở prod, JWT localStorage-only (dùng httpOnly cookie + CSP không inline script).
# 5. NGHIỆM THU: `npm run verify` ALL PASS; `npm test` ≥6 (auth 4 + audit 2); login sai 5 → khóa; warehouse→debts-write 403; grep không nối chuỗi SQL. Dán output verify + test.
# 6. GIỚI HẠN: ≤8 file code + 3 test. Không làm nghiệp vụ.
```
