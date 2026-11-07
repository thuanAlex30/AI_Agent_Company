# ADR-0012: Refresh token atomic rotation + session management

Ngày: 2026-11-07 | Trạng thái: chấp nhận | Liên quan: Phase 2 (P0-2, P1-11, P1-12)

## Bối cảnh

v8.0 dùng access token (JWT) 8 giờ + refresh token 24 giờ lưu **plaintext** trong DB.
Hai vấn đề nghiêm trọng:

1. **Không phát hiện tái sử dụng (reuse)**: đánh cắp refresh token → dùng song song với
   chủ nhân, cả hai đều hợp lệ, không ai biết.
2. **Không quản lý phiên**: đổi mật khẩu / nghi ngờ bị xâm nhập → **không thu hồi**
   được các phiên đang mở.
3. Access token 8 giờ ⇒ mất phiên làm việc 8 giờ liền, không có cơ chế refresh.

## Quyết định

1. **Access token TTL rút còn 30 phút** (`ACCESS_TTL=30m`, biến môi trường).
   Refresh token TTL 7 ngày (`REFRESH_DAYS=7`).
2. **Refresh token chỉ lưu hash** (SHA-256) trong `refresh_tokens.token_hash` —
   không lưu plaintext. Cookie `refresh_token` là `httpOnly` + `secure` (prod) +
   `sameSite` theo `COOKIE_SAMESITE`.
3. **Xoay vòng nguyên tử (atomic rotation)**:
   ```sql
   UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='rotated'
    WHERE id=? AND revoked IS NOT TRUE
   ```
   Phải đổi **đúng 1 dòng** mới được cấp token mới. Nếu 2 request cùng lúc dùng
   cùng token → request thứ nhất thắng, request thứ hai nhận 401.
4. **Phát hiện tái sử dụng (reuse detection)**: token đã `revoked` mà vẫn được gửi lên
   ⇒ coi là **reuse** ⇒ **thu hồi TOÀ BỘ phiên** của user đó.
   **Thao tác này cố ý chạy NGOÀI transaction** — nếu trong tx mà tx rollback vì
   lý do khác thì lệnh thu hồi cũng biến mất, mất tác dụng bảo vệ.
5. **Binding mềm UA/IP**: UA khác hoàn toàn ⇒ reuse (thu hồi toàn bộ phiên);
   IP khác (NAT đổi IP) ⇒ chỉ ghi cảnh báo, **không chặn**.
6. **`auth_version`** trên `users`: tăng ⇒ mọi access token cũ vô hiệu
   (dùng khi đổi mật khẩu).
7. **Session management**: `GET /api/auth/sessions` (chỉ phiên của chính user),
   `DELETE /api/auth/sessions/:id` (thu hồi 1 phiên), `POST /api/auth/logout-all`
   (thu hồi toàn bộ phiên).
8. **Giới hạn số phiên đồng thời** (`MAX_SESSIONS_PER_USER`): vượt ⇒ thu hồi
   phiên cũ nhất với `revoked_reason='session_limit'`.

## Hệ quả

- **Tích cực**: đánh cắp refresh token chỉ dùng được **1 lần**; reuse bị phát hiện
  và chấm dứt toàn bộ phiên. Đổi mật khẩu thực sự chấm dứt phiên.
- **Chi phí**: FE phải có luồng refresh (Phase 5) — nếu không, user bị logout mỗi 30 phút.
- **Rủi ro**: reuse detection thu hồi toàn bộ phiên khi UA đổi (VD trình duyệt update)
  ⇒ người dùng phải đăng nhập lại. Chấp nhận (fail-secure > fail-open).

## Thay thế bị loại

- **Giữ refresh token plaintext**: bị đọc lộ khi DB/backup lộ ⇒ không có đường thu hồi.
- **Không xoay vòng (tái sử dụng token cũ)**: không phát hiện được đánh cắp.
- **Thu hồi toàn bộ phiên trong transaction**: rollback sẽ vô hiệu hoá chính cơ chế bảo vệ.
