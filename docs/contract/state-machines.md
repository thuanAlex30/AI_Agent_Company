# State machines v6.1 (nguồn duy nhất, UI vẽ dropdown từ đây, backend enforce)

> INV-8: Mọi chuyển trạng thái đi qua bảng transition. Chuyển sai ⇒ `400 VALIDATION`, **không** update lệch.
> Backend enforce tại: `src/modules/sales/service.js` (ORDER_FLOW), `src/modules/helpdesk/service.js`
> (TICKET_FLOW), `src/modules/supply/service.js` (SHIP_FLOW), `src/modules/it/service.js` (IT_FLOW).

## orders (ORDER_FLOW — src/modules/sales/service.js)

```
draft             → pending_approval | pending | cancelled
pending_approval  → pending | cancelled | rejected
pending           → approved | partial | cancelled
approved          → in_progress | partial | cancelled
in_progress       → done | partial | cancelled
done              → paid | partial
partial           → paid | partial | refunded
paid              → refunded
cancelled         → (terminal)
refunded          → (terminal)
```

- `paid` khi `SUM(payments) >= amount`; `partial` khi `0 < SUM(payments) < amount`.
- Thanh toán đầy đủ khi đơn chưa qua `done` **vẫn phải đi qua `partial` trước `paid`**
  (`orderTransitionPath`) ⇒ không bỏ qua bước giao hàng.
- `cancelled` chỉ khi **chưa có payment** nào; `refunded` chỉ từ `paid`/`partial`
  (payments âm + hoàn kho theo `order_items`).
- `done` khi mọi shipments `done` + qa `pass`.

## debts
```
open     → done | overdue | cancelled
overdue  → done | cancelled
done     → (terminal)
cancelled→ (terminal)
```
- `cancelled` khi order bị `cancelled`/`refunded`.

## shipments (SHIP_FLOW — src/modules/supply/service.js)
```
pending  → shipping | cancelled
shipping → done | failed | cancelled
failed   → shipping (attempt+1) | cancelled
```

## purchase_orders
```
draft → pending_approval → approved → sent → received (stock in + payable)
      | rejected | cancelled
```

## contracts
```
draft → pending_approval → legal_review → approved → signed
      | rejected | terminated
```
- `signed` yêu cầu approval `approved` ở **cấp chính** (`amount_routing.contract` trong
  `approval-matrix.json`) **và** cấp bổ sung `legal` nếu `contract_extra_legal` khớp.
- `signed_date` được set khi chuyển sang `signed`.

## leads
```
new → mql → sql → quoted → negotiating → won | lost
```

## tickets (TICKET_FLOW — src/modules/helpdesk/service.js)
```
open      → processing | closed
processing→ resolved | closed
resolved  → open (reopen_count+1) | closed
```

## it_incidents (IT_FLOW — src/modules/it/service.js)
```
open     → fixing | closed
fixing   → resolved | closed
resolved → closed | open
closed   → open
```

## approvals
```
pending → approved | rejected
```
- Cấm chuyển tiếp sau `decided` (mọi transition còn lại ⇒ `400`).
- Cấp duyệt **luôn tính từ** `docs/contract/approval-matrix.json`
  (`amount_routing.expense_po`, `amount_routing.contract`, `contract_extra_legal`);
  client **không** được ép cấp (`400` nếu `level` gửi lên ≠ cấp bắt buộc).

## SLA
- Tính theo **GIỜ LỊCH** (calendar hours): `sla_due = created + sla_hours`
  (`manifest.conventions.sla_hours`), lưu UTC, hiển thị `Asia/Ho_Chi_Minh`.
- `SLA_BREACH` dùng ở `helpdesk.listSLA` + alert.
