# 07 — AI design v6.1 (tóm tắt, guardrail 2 lớp)

- Rule: normalize NFD + đ/Đ→d/D; khớp CÓ DẤU trước, bỏ dấu dự phòng; regex ranh giới từ (khong≠kho, ten≠te, hồng≠hỏng); complaint chỉ theo cụm; `policy_inquiry` tách riêng (hỏi chính sách → trích knowledge, không ticket); technical cấm 'giao' chung.
- Debt intent: cấm nói số khi chưa xác thực (SĐT body khớp customers.phone hoặc OTP dev) — ai khai mã cũng xem được là fail.
- LLM: context tối thiểu (không bao giờ cost/lương), số trong reply phải thuộc whitelist context (số lạ → `[CẦN-DUYỆT]`), system bất biến (≤80 từ, xưng em, chốt 1 hành động, cấm hứa giảm/quà, >10tr cờ), strip injection bằng thiết kế (không đưa instruction vào prompt).
- Guardrail CODE sau reply: regex giảm/tặng/miễn phí + leak cost/lương → che `[giá nội bộ]` + cờ. RAG top-3 đoạn `##` + trích nguồn.
- Vận hành: rate-limit chat 30/5p, auth (cấm anonymous prod), channel=web, log in/out + tokens/latency, cron cấm (chỉ export hàm), CI chỉ chạy rule (`test:llm` riêng), eval 100 câu ≥85 + 0 hứa bậy.
