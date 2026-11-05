# 10 — Operations v6

- Lệnh chuẩn: `npm ci && npm run migrate && npm run verify && npm test && npm start`. (Sửa: dùng migrate, không dùng `node src/db.js`.)
- Múi giờ chốt Asia/Ho_Chi_Minh cho cron/SLA/khung nhắc/chấm công; DB lưu UTC.
- Backup: SQLite dùng `.backup` (đúng WAL) + pg_dump prod, `scripts/backup.sh` 2h sáng, test restore tự động hằng tuần (sửa "mỗi ngày/mỗi 2 giờ" mập mờ).
- Cron duy nhất ở scheduler.js (4 dòng, xem 02d-1). Prod checklist: JWT_SECRET 32 ký tự, cấm seed, cấm x-user-code, trust proxy + helmet + rate-limit, httpOnly cookie + CSP (cấm inline script + localStorage JWT).
