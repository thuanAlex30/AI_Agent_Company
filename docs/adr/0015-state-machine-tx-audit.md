# ADR-0015: State machine + transaction + audit gắn chặt (INV-2, INV-8)

Ngày: 2026-11-07 | Trạng thái: chấp nhận | Liên quan: Phase 4 (P1-6..P1-21)

## Bối cảnh

Ba lớp bảo vệ dữ liệu trong v8.0 đều **có thể bị lách**:

1. **Chuyển trạng thái tự do**: `PATCH /api/it-incidents/:id` nhận bất kỳ `status`
   nào trong `{open, fixing, resolved, closed}` — kể cả nhảy `open → closed`.
   `orders` cũng vậy (`pending → paid` bỏ qua bước giao hàng).
2. **Audit nằm ngoài transaction**: `writeAudit(null, ...)` ghi ra ngoài tx, chỉ
   log warning khi thiếu conn ⇒ có thể tồn tại **bản ghi không có audit**, hoặc
   **audit của bản ghi đã bị rollback**.
3. **Đọc-trước-ghi-sau (lost update)**: 2 request đồng thời đọc cùng trạng thái
   rồi cùng ghi ⇒ trạng thái cuối là của request "đến sau", không phải nghiệp vụ.

## Quyết định

### 1. State machine là bảng transition (INV-8)

Nguồn duy nhất: `docs/contract/state-machines.md`. Mã nguồn:
`ORDER_FLOW` (sales), `TICKET_FLOW` (helpdesk), `SHIP_FLOW` (supply), `IT_FLOW` (it).

- Chuyển không có trong bảng ⇒ `400 VALIDATION`, **không** update lệch.
- Đơn chưa giao xong mà thanh toán đủ ⇒ **bắt buộc đi qua `partial` trước `paid`**
  (`orderTransitionPath`) — không bỏ qua bước giao hàng.
- Mỗi bước trong đường đi ghi **một audit riêng** ⇒ truy vết thấy rõ "đã partial
  rồi mới paid".

### 2. Audit bắt buộc nằm trong cùng transaction (INV-2)

`writeAudit(conn, ...)` **ném lỗi 500** nếu thiếu `conn` — không còn "ghi ra ngoài
rồi log warning". Mọi service phải tự bọc `tx`.

### 3. Khoá dòng trước khi ghi (P1-9)

`c.lock('SELECT ... FOR UPDATE')` trên PostgreSQL (SQLite: transaction serialize).
Áp dụng cho: `orders` (setOrderPaid/cancel/refund), `debts` (recordPayment,
markDebtCancelled), `approvals` (decideApproval), `products` (moveStock).

Update sau khi khoá là **conditional**: `UPDATE ... WHERE id=? AND status=?` và bắt
buộc `changes === 1`, nếu không ⇒ `409 CONFLICT`.

### 4. Không suy luận ID từ "bản ghi mới nhất" (P1-8)

Cấm tuyệt đối `SELECT id FROM t ORDER BY id DESC LIMIT 1` sau khi INSERT (có thể
trả về ID của giao dịch đồng thời khác). Dùng `insertedId(r, table)`
(`RETURNING id` trên PG, `lastInsertRowid` trên SQLite).

### 5. Nguồn sự thật cho cấp duyệt (P1-6, INV-6)

Cấp duyệt **luôn tính từ** `approval-matrix.json` (`amount_routing.expense_po`,
`amount_routing.contract`, `contract_extra_legal`). Client **không được ép cấp**
⇒ `400` nếu `level` gửi lên ≠ cấp bắt buộc (hoặc ≠ cấp bổ sung hợp lệ).

## Hệ quả

- **Tích cực**: trạng thái không thể "nhảy"; không còn bản ghi mồ côi; không còn
  lost-update; cấp duyệt không thể bị ép.
- **Chi phí**: mọi mutation phải bọc `tx`; thêm một bảng transition cho mỗi
  thực thể có vòng đời; `INSERT` phải trả ID.
- **Rủi ro**: đường đi hợp lệ bị chặn nhầm (VD `pending → paid`) ⇒ đã xử lý bằng
  `partial` trung gian + `orderTransitionPath`; test `phase4.test.js` khoá hành vi.

## Thay thế bị loại

- **Chỉ validate tập giá trị (`['open','fixing',...]`)**: không chặn được nhảy trạng thái.
- **Audit ghi ngoài tx + log warning**: vi phạm "không thể bỏ reu".
- **Đọc-rồi-ghi không khoá**: lost-update trong race condition.
- **Cho client tự chọn cấp duyệt**: chấn 2 cấp trái phép.
