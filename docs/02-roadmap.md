# 02 — Roadmap v6.1 (phase đúng phụ thuộc, DoD đo được)

## P0 — Nền (01 + 02a) — DoD
- `npm run migrate` + `node scripts/verify.js` ALL PASS + `npm test` ≥6 (auth 4 + audit 2).
- Migration per-dialect + seed chỉ dev (`npm run seed:demo`), CI matrix sqlite+postgres.
- DoD: clone mới → `npm ci && npm run migrate && npm run verify && npm test && npm start` xanh.

## P1 — Core tiền-hàng (02b + 02d-1 + 03a)
- O2C có cổng duyệt (contract≥50tr), P2P có cổng duyệt, đối soát ghi payments (fixture 10 dòng → matched 8, ≥80%), Idempotency orders/payments, tab Ops + login + CEO rút gọn (P2 stub).
- Auth JWT + RBAC + scheduler 4 cron duy nhất ở đây.
- DoD: 50 đơn không lệch kho/nợ; invariants.sql 0 dòng; 403 đúng ma trận.

## P2 — Người + KH (02c + 02d-2 + 03b/03c)
- HR gắn JWT, payroll-preview lọc backend, ticket SLA 2/4/24/72h giờ lịch, ROI từ VIEW, overview 12 khối + brief.
- DoD: SLA breach <10%, CSAT đo được, overview đủ 12 keys.

## P3 — AI (04)
- Rule word-boundary (có dấu trước), policy_inquiry tách complaint, xác thực SĐT trước khi nói nợ, whitelist số, guardrail code, RAG top-3, rate-limit chat, CI chỉ chạy rule (LLM job riêng).
- DoD: rule eval ≥85/100, 0 hứa bậy, không cron mới.

## P4 — Nhân rộng (chưa làm, cấm đưa vào P0-P3)
