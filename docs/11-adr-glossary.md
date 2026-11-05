# 11 — Thuật ngữ + chuẩn v6.1 (trỏ về contract, cấm số tay)

Mọi định nghĩa dùng được trong code chỉ sống ở: manifest.conventions (SLA urgent 2/high 4/normal 24/low 72, timezone VN, DSO, retention, win_rate, cờ `[CẦN-DUYỆT]`, chấm công `employee_code`), enums.json, state-machines.md, approval-matrix.json. File này chỉ giải thích tiếng Việt:

- **Đối soát**: khớp sao kê với remain (không phải amount), bắt buộc có mã, hòa điểm → review người duyệt.
- **Remain** = amount − paid (BIGINT đồng). **AR** = Σ remain receivable open/overdue. **DSO** = AR / (revenue orders 30d / 30).
- **SLA giờ lịch**: sla_due = created + sla_hours, lưu UTC, hiển thị VN.
- **FCR** = ticket resolved mà reopen_count = 0. **Retention** = khách ≥2 đơn / khách ≥1 đơn. **Turnover** từ left_date.
- **normalize**: NFD + đ/Đ→d/D; khớp có dấu trước, bỏ dấu dự phòng; regex ranh giới từ.
