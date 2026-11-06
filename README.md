# BizOps AI — AI vận hành doanh nghiệp nhỏ

Nền tảng riêng (không phụ thuộc Zalo/FB), làm từ con số 0, kiến trúc mở rộng đa phòng ban.

## MVP gồm 3 module (theo yêu cầu full-platform)

1. **Đối soát tự động** (`/api/reconcile`)
   - Import sao kê CSV -> auto-match với đơn hàng / công nợ (số tiền + ngày + nội dung)
   - Trạng thái: `matched | unmatched | cần duyệt tay`
2. **Nhắc công nợ** (`/api/debts`)
   - Quản lý công nợ phải thu/phải trả, phân loại: sắp tới hạn / quá hạn
   - Cron 8h sáng + nút "Nhắc ngay" -> tạo lịch sử nhắc, mẫu tin AI cá nhân hóa
   - Kênh riêng: In-app (MVP) + stub Email/SMS để cắm sau
3. **CSKH AI** (`/api/cskh`)
   - Chatbot + Ticket + chiến dịch sau bán (3-7-30 ngày)
   - Chạy rule-based ngay, cắm LLM qua `OPENAI_API_KEY` khi sẵn sàng

## Mở rộng đa phòng ban (plugin)

```
src/modules/
  sales/ accounting/ inventory/ hr/ marketing/
  reconciliation.js debt.js cskh.js  <- core MVP
src/agent/agent.js <- Agent điều phối đa phòng ban
```

## Chạy

```powershell
cd d:\Du_An_2026
npm install
copy .env.example .env
npm start
```

Mở: http://localhost:3000

## API nhanh

- `GET /api/health`
- `GET/POST /api/customers`
- `GET/POST /api/orders`
- `GET/POST /api/transactions` + `POST /api/transactions/import-csv`
- `POST /api/reconcile/run`
- `GET/POST /api/debts` + `POST /api/debts/:id/remind`
- `POST /api/cskh/chat` + `GET/POST /api/cskh/tickets`
- `GET /api/departments/overview` (đa phòng ban)

DB: SQLite (`data/bizops.db`), tự tạo bảng khi start.
