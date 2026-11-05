# PROMPT 04 v6.1 — AI P3 (rule xác định + LLM riêng, whitelist số, xác thực nợ)

> Precondition: P2 xanh. CẤM cron mới (chỉ export hàm cho scheduler 02d-1). Chat route giữ từ 03b, prompt này thay service.

```Prompt
# 1. PRECONDITIONS: verify xanh, chat stub tồn tại. Đọc manifest.conventions ([CẦN-DUYỆT], SLA, timezone), enums (ticket_category gồm policy_inquiry), knowledge mẫu.
# 2. EXPORTS: `src/modules/cskh/service.js` (chatReply) + `src/agent/skills/*.js` (tên file khớp department: sales,marketing,cskh,ops,supply,finance,hr,it,legal,qa,product + ceo.js) + `src/agent/agent.js` (overview dùng ở 02d-2, brief) + `docs/ai/knowledge/*.md` + `tests/fixtures/chat-cases-100.json` ĐỦ 100 câu (nối tiếp khung 20 câu 02c, ĐÚNG 1 đường dẫn này) + `tests/chat-rule.test.js` (CI chỉ chạy rule — LLM job riêng `test:llm`).
# 3. RULE (word-boundary sau normalize NFD+đ→d): khớp bản CÓ DẤU trước, bỏ dấu dự phòng; complaint chỉ cụm (đổi trả/bảo hành/khiếu nại/hàng lỗi-hỏng) — "chính sách đổi trả thế nào?" → policy_inquiry (trích knowledge top-1, không ticket); technical cấm 'giao' chung (trừ giao lỗi/thất bại/mất hàng); debt intent CẤM nói số khi chưa xác thực (SĐT body khớp customers.phone hoặc OTP dev — ai khai mã cũng xem được là fail); thanks chỉ xin sao (cấm rating nháp).
# 4. LLM: context tối thiểu (tồn/giá/campaign/nợ đã xác thực, KHÔNG bao giờ cost/lương); mọi số trong reply phải thuộc whitelist context, số lạ → [CẦN-DUYỆT] (có gạch nối); system bất biến (≤80 từ, xưng em, chốt 1 hành động, cấm hứa giảm/quà, >10tr cờ); strip injection bằng thiết kế (không đưa instruction vào prompt); guardrail CODE sau reply (regex giảm/tặng/miễn phí + leak cost/lương → che '[giá nội bộ]' + cờ).
# 5. RAG top-3: knowledge chia ##, overlap từ, top-3 vào context + trích nguồn.
# 6. Rate-limit chat riêng (30/5p/IP+user), auth theo roles chat.write (cấm anonymous prod), channel=web, log in/out + tokens/latency.
# 7. NGHIỆM THU: 'khuyến mãi không?'→promo; 'giao mấy ngày?'→ship easy không ticket; 'hồng' không khớp 'hỏng'; nợ chưa xác thực không lộ số; bẫy giảm 50%/lộ cost/injection bị chặn code; rule eval ≥85/100 CI xanh; LLM tay không chặn CI; không cron mới (verify PASS). Dán bảng chấm + output.
# 8. GIỚI HẠN: service + 12 skill + agent + knowledge + 100 cases + 1 test rule.
```
