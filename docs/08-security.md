# 08 — Security v6.1 (tóm tắt, ma trận ở roles-permissions.json)

- users + refresh_tokens (hash, xoay vòng, thu hồi, logout revoke); bcrypt 10; lock 5 sai/15p; JWT access 8h; fail-fast JWT_SECRET prod; cấm seed prod; cấm x-user-code prod.
- RBAC từ roles-permissions.json (đủ 14 role gồm legal/hr; attendance.checkin `*` = mọi role đăng nhập; users.unlock hr/ceo/owner; chat.write cskh/sales/manager+). Lọc `salary_base`/`password_hash` ở backend, không chỉ ẩn UI.
- Checkin gắn JWT (code = user.employee_code trừ hr/manager+). Cổng duyệt: requester≠decider kể cả CEO; cấp cao duyệt thay cấp thấp; legal chỉ bước legal; createOrder/receivePO/payment(expense) kiểm tra approved.
- Hardening: helmet, trust proxy, rate-limit (login 10/15p, api 300/15p, chat 30/5p), json 1mb, CSV ≤2MB, tham số hóa 100%, requestId, httpOnly cookie + CSP (cấm inline + localStorage JWT), audit append-only cùng tx, backup `.backup`/pg_dump + restore test, nhắc nợ reminder_log 1/ngày/khoản khung 8h–20h VN.
