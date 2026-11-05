# 03 — BRD v6 (12 khối, bổ sung story còn thiếu)

Scope 12 khối theo ADR-0005/0011. Giữ 14 story cũ, bổ sung:
- US-SAL-03: convert lead→quote→contract→order một lần (cổng duyệt contract ≥50tr).
- US-FIN-04: ghi nhận thanh toán từng lần (tiền mặt/CK/ví), bấm đúp không đúp tiền (Idempotency).
- US-FIN-02 (sửa): 1 click nhắc toàn bộ nợ (`POST /debts/remind-all`, guard reminder_log 1/ngày/khoản).
- US-P2P-01: PO→duyệt→nhận hàng→nhập kho→công nợ phải trả→thanh toán expense.
- US-REF-01: đổi trả/hoàn tiền sau paid (paid→refunded, payments âm, hoàn kho).
- US-HR-02 (rõ): bảng lương tạm tính = salary_base/26 × ngày present (chỉ owner/ceo/hr/cfo thấy).
- US-GOV-01: phê duyệt phân cấp + thay cấp (approval-matrix.json), requester≠decider.
- US-GOV-02: nhật ký audit tra cứu được.
- US-LEG-01/US-IT-01/US-QA-01/US-PRD-01: legal review hợp đồng, incident MTTR, qa defect/repeat, feature stage.
Chi tiết traceability: xem docs/contract/traceability.csv (nguồn duy nhất).
