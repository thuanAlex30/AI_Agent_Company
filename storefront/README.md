# BizOps Storefront

Cửa hàng công khai của BizOps Café — React 18 + Vite 5 + react-router-dom 6.
Khách hàng dùng **không cần đăng nhập**; nhân viên dùng hệ thống nội bộ ở `frontend/`.

- **Cổng dev:** `http://localhost:5174`
- **API:** `http://localhost:3000/api/public/*` (proxy qua Vite dev server)

---

## 1. Chạy nhanh

```bash
cd storefront
npm ci
npm run dev            # http://localhost:5174
```

Backend phải chạy trước (`cd backend && npm run migrate && npm run seed:storefront && npm run dev`).

### Build & phục vụ giống production

```bash
npm run build          # -> dist/
npm run serve:gzip     # http://127.0.0.1:4173 (gzip + cache header + proxy /api)
```

`serve:gzip` mô phỏng đúng nginx production (gzip level 6, `immutable` 1 năm cho
`/assets/` và `/fonts/`, SPA fallback, **proxy `/api` sang backend**). Luôn dùng
server này khi đo Lighthouse — `vite preview` không nén và không có API nên số
đo sẽ sai.

---

## 2. Kiểm tra chất lượng (CI cũng chạy)

| Lệnh | Việc làm |
|---|---|
| `npm run check:bundle` | Kiểm ngan sách bundle: JS ban đầu ≤ 150 kB gzip (§7.1) |
| `npm run check:ui` | 50 kiểm tra responsive 360→1440px: tràn ngang, thiếu `label`/`alt`, lỗi console, rò rỉ PII |
| `npm run lh` | Lighthouse mobile (Slow 4G, CPU 4×) cho Home/Catalog/Detail/Checkout |
| `npm run lh:median` | Như trên nhưng **median 3 lần** — dùng để so sánh biến thể (1 lần đo có nhiễu lớn) |
| `npm run bench` | Đo nhanh FCP/LCP bằng Puppeteer + CDP throttle (~45s, thay vì ~4,5 phút) |
| `npm run e2e:idempotency` | Gửi 5 lần cùng `Idempotency-Key` → xác nhận **chỉ 1 đơn** được tạo |

Các script đo đều cần Chrome. Đặt đường dẫn nếu không ở vị trí mặc định:

```bash
# PowerShell
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

---

## 3. Cấu trúc

```
src/
  main.jsx            Mount React
  App.jsx             Router + code-splitting (React.lazy theo route)
  index.html -> ../index.html
  styles/
    tokens.css        Design token (nguồn sự thật cho màu/bo goc/chu/khoang cách)
    fonts.css         @font-face tự host + fallback metric-compatible
    ui.css            Kiểu cho bộ components/ui
  styles.css          Layout + kiểu riêng từng trang
  components/
    ui/               Button, Field, Badge, Card, Skeleton, Toast, Modal, Stepper,
                      QuantityInput, PriceTag, Countdown, States, Icon (SVG inline)
    Layout.jsx        Header dính, nav dưới mobile, skip-link, footer
    ErrorBoundary.jsx Lỗi toàn cục + theo trang (không bao giờ màn hình trắng)
  pages/              Home, Catalog, Detail, Cart, Checkout, Confirm, Lookup,
                      Services, Promos, Support, SearchPage
  services/
    api.js            Gọi `/api/public/*`
    http.js           Timeout 10s, retry GET (backoff 500/1500ms), AbortController, xử lý 429
  hooks/              usePageMeta, useReveal
  store/cart.js       Giỏ hàng (đồng bộ giữa các tab qua `storage` event)
public/fonts/         Be Vietnam Pro subset (woff2, tự host — không CDN ngoài)
```

---

## 4. Quyết định kỹ thuật đáng chú ý

### 4.1 Font tự host + fallback metric-compatible

Webfont **không** tải từ CDN ngoài. Chỉ 4 file WOFF2 (latin + vietnamese × weight
400/700), tổng **22,5 kB** — đã subset từ 179 kB gốc bằng `scripts/subset-fonts.py`
(chỉ giữ 224 ký tự giao diện thực sự dùng).

Vấn đề đã đo: webfont `swap` làm **vùng paint H1 đổi kích thước** → Chrome coi đó
là ứng viên LCP mới và **ghi lại LCP ở thời điểm muộn** (~3 s), vượt ngân sách 2,5 s.
Cách sửa (W3C `css-fonts-4`): khai báo `@font-face` cho fallback `BVP Fallback` với
`size-adjust` / `ascent-override` / `descent-override` sao cho **fallback rộng ≥ webfont
thật** → khi swap xong vùng paint nhỏ lại → không có ứng viên lớn hơn → **Chrome không
ghi lại LCP**.

Giá trị `size-adjust` được đo bằng DOM thật (`scripts/font-fit.cjs`, đã chuyển
sang `../archive/storefront-lab-scripts/`), không đoán:
weight 400 → `93.53%`, weight 700 → `113.92%`.

### 4.2 CSS được inline, không tải song song

`vite.config.js` có plugin `inlineCss` gộp toàn bộ CSS vào `<head>`, và plugin
`inlineFontFaces` đưa `@font-face` vào `<head>`.

Lý do (đo bằng Lighthouse, không phải phỏng đoán): nếu CSS tải bất đồng bộ, trình
duyệt phải **style + layout hai lần** (shell rồi mới tới CSS đầy đủ) → "Style & Layout"
nhảy từ 315 ms lên 1125 ms → FCP/LCP chậm hơn. CSS inline chỉ cần một lần layout.

### 4.3 Static shell trong HTML

`index.html` chứa sẵn khung giao diện (header, hero, H1) để H1 paint ngay từ HTML,
không phải đợi JS tải + phân tích + React render. React thay thế `#root` khi mount;
H1 của React **cùng kích thước** với H1 của shell nên Chrome không ghi lại LCP.

### 4.4 Bảo mật giao diện

- **Không** có PII/token trong `localStorage` hay query string.
  Lookup token lưu ở `sessionStorage` (`bizops-lookup:<code>`), đọc lại bằng mã đơn.
- Lookup đòi **2 yếu tố** (mã đơn + SĐT/email) và trả thông báo chung chung
  ("không tìm thấy") để không dò tài khoản.
- `Idempotency-Key` sinh một lần mỗi lượt đặt, **giữ lại** khi thất bại để gửi lại
  cùng khóa → không tạo đơn trùng (kiểm chứng bằng `npm run e2e:idempotency`).
- ChatWidget không có ô nhập tra cứu công nợ — chỉ hướng khách sang trang *Tra cứu đơn*.
- Không có `dangerouslySetInnerHTML`; highlight từ khoá dựng bằng text node.

### 4.5 Token-driven

Mọi màu / bo goc / cỡ chữ / khoảng cách nằm trong `styles/tokens.css`. Đổi nhận diện
= đổi token, không sửa component. Kiểm tra: `grep -rn "#[0-9a-fA-F]\{3,8\}" src/components src/pages`
chỉ còn các trường hợp hợp lệ (màu trạng thái nội bộ trong `ui.css`).

---

## 5. Triển khai

Dockerfile + `nginx.conf` (gzip, cache immutable, SPA fallback). Không kèm khoá/secret
trong bundle. Biến môi trường duy nhất là URL API qua reverse proxy `/api`.

---

## 6. Ghi chú nhân rộng theme theo ngành

Bảng màu hiện là nâu cà phê (quán cà phê / F&B). Đổi sang ngành khác chỉ cần sửa
`styles/tokens.css`:

- `--brand-*` (màu chủ đạo), `--accent-*` (màu nhấn/CTA)
- **Bắt buộc**: nếu `--accent-600` làm nền nút có chữ trắng, đảm bảo tương phản
  ≥ 4,5:1 (hiện `#B25213` đạt 5,07:1 — `#D9651F` chỉ đạt 3,6:1 và đã bị loại).
- `--font`: font tự host; nếu đổi font, chạy lại `npm run fonts:subset` và cập
  nhật `size-adjust` trong `styles/fonts.css` bằng `scripts/font-fit.cjs`
  (script đo này nằm ở `../archive/storefront-lab-scripts/font-fit.cjs`).
