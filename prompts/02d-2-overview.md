# PROMPT 02d-2 v6.1 — OVERVIEW 12 KHỐI + MODULE PHỤ P2

> Precondition: 02c + 02d-1 xanh. Thuộc P2.

```Prompt
# 1. PRECONDITIONS: verify xanh. Đọc manifest.conventions (DSO/retention/win_rate), table-ownership (risk/it/qa/product service riêng), traceability (overview.test.js).
# 2. EXPORTS: `src/modules/{risk/service.js,it/service.js,qa/service.js,product/service.js}` (mỗi module service riêng — cấm route viết thẳng) + `src/modules/governance/overview.js` (12 keys + ceo, try/catch từng khối; P1 03a gọi bản rút gọn sales/supply/finance, stub {status:'P2'} cho khối chưa xây) + `dailyBrief` markdown + routes + `tests/overview.test.js`.
# 3. KPI đúng glossary v6.1: retention=mua≥2/khách≥1, turnover từ left_date, uptime ước tính ghi chú, DSO từ orders (không cộng transactions), FCR từ reopen_count, defect/repeat từ repeat_of. agent_suggestion 5 việc {title,why,raci:{R,A},api,deadline}.
# 4. CẤM: overview sập khi 1 skill lỗi (phải try/catch từng khối), invent KPI không nguồn.
# 5. NGHIỆM THU: đủ 12 keys + 5 suggestions RACI; drop 1 bảng skill lỗi không sập; brief đọc 2 phút; verify PASS. Dán output.
```
