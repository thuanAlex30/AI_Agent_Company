# PROMPT 02c v6.1 — NGƯỜI + KHÁCH P2 (HR gắn JWT, SLA giờ lịch, ROI từ VIEW)

> Precondition: 02b xanh.

```Prompt
# 1. PRECONDITIONS: verify xanh. Dán output. Đọc manifest.conventions.sla_hours (urgent 2/high 4/normal 24/low 72), enums, state-machines v6.1, roles-permissions (attendance.checkin '*', lọc lương).
# 2. EXPORTS: `src/modules/{hr/service.js,helpdesk/service.js,marketing/service.js}` + `src/routes/{hr.js,helpdesk.js,marketing.js}` + `tests/{sla,roi,hr}.test.js` + `tests/fixtures/chat-cases-100.json` KHUNG (20 câu mẫu; 04 điền tiếp 80 câu vào ĐÚNG file này — cấm tạo tests/chat-cases-100.json trùng).
# 3. ĐẶC TẢ
- hr (KHÔNG write users/refresh_tokens): checkin/out {employee_code} xác thực JWT (code = user.employee_code trừ hr/manager+; nếu không thì 403 chấm hộ); late sau 08:30 VN; 1 ngày 1 dòng; payroll-preview (US-HR-02): salary_base/26 × present tháng — lọc backend theo field_filter.
- helpdesk: sla_due = created + sla_hours manifest (giờ lịch, lưu UTC hiện VN); code TCK-xxxx; first_response/resolved/reopen_count+1 (FCR); listSLA dùng SLA_BREACH; csat AVG stars; category gồm policy_inquiry.
- marketing: ROI CHỈ từ v_campaign_roi (JOIN leads), cpo>200k alert.
- ratings: stars NOT NULL + customer_id tồn tại + (order_id|ticket_id) bắt buộc (cấm rating nháp).
# 4. CẤM: rating nháp, cột tĩnh campaigns, SLA high 8h, employee_id số ở API, hr write users.
# 5. NGHIỆM THU: urgent≈+2h/high≈+4h; reopen FCR đúng; thiếu stars 400; ROI tăng khi thêm lead; chấm hộ 403; lương bị lọc với sales. Dán output test + verify.
# 6. GIỚI HẠN: 3 service + 3 route + 3 test.
```
