# PROMPT 02d-1 v6.1 — PHÊ DUYỆT + SCHEDULER + SERVER P1 (cổng duyệt thật, cron duy nhất)

> Precondition: 02b xanh. Thuộc P1 (cùng 03a).

```Prompt
# 1. PRECONDITIONS: verify xanh. Đọc approval-matrix.json v6.1 (leader<5tr, manager<50tr, cfo<200tr, ceo≥200tr; legal chỉ bước legal; cấp cao duyệt thay cấp thấp; requester≠decider kể cả CEO).
# 2. EXPORTS: `src/modules/governance/approvals.js` (requestApproval, decideApproval) + `src/common/scheduler.js` (4 cron DUY NHẤT, múi giờ Asia/Ho_Chi_Minh: '0 8 * * *' markOverdue+remindAll, '*/5 * * * *' sop quá due→overdue, '0 2 * * *' backup.sh, '5 8 * * *' brief — prompt 04 cấm schedule) + `src/server.js` hoàn chỉnh P1 (helmet, trust proxy, rate-limit login 10/15p + api 300/15p, mount auth+sales+supply+finance+approvals+audit-read, errorHandler) + `src/routes/gov-min.js` (approvals, audit, users unlock) + `tests/approval.test.js`.
# 3. CỔNG DUYỆT: createOrder/receivePO/recordPayment(expense) kiểm tra approvals approved (chưa duyệt → 403 APPROVAL_REQUIRED). Contract→signed chỉ khi đủ approvals (kèm bước legal khi amount≥50tr hoặc note rủi ro/pháp lý/kiện).
# 4. CẤM: CRUD risks/it/qa/product ở đây (sang 02d-2), cron ở file khác, tự duyệt (kể cả CEO), level 'director/cfo' gộp (dùng 'cfo').
# 5. NGHIỆM THU: tự duyệt 403 đúng message; sai level 403; PO chưa duyệt receive bị chặn; cron list đúng 4; verify cron-check + approval-matrix version v6.1 PASS. Dán output.
```
