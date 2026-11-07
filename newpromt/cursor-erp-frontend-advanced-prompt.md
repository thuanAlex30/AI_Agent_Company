Bạn là senior product designer và senior frontend engineer. Hãy nâng cấp giao diện ứng dụng ERP nội bộ trong repository `thuanAlex30/AI_Agent_Company` thành một hệ thống quản trị doanh nghiệp chuyên nghiệp, dễ dùng, responsive và an toàn.

# 1. Mục tiêu sản phẩm

Nâng cấp **ứng dụng nội bộ trong `frontend/`** — không phải storefront public — thành giao diện làm việc hằng ngày cho các nhóm:

- CEO
- Sales
- Finance
- Ops/Kho
- CSKH
- Marketing
- HR
- IT
- Legal
- QA
- Product

Giao diện cần giúp người dùng nhanh chóng:
- nắm được việc cần xử lý;
- xem dữ liệu đúng với quyền và phạm vi của mình;
- thực hiện nghiệp vụ hiện có qua API;
- nhận biết rõ trạng thái thành công, lỗi, đang tải và không có dữ liệu.

Đây là nâng cấp frontend, **không phải viết lại ERP hoặc thêm nghiệp vụ giả**.

# 2. Nguyên tắc bắt buộc

1. Trước khi sửa, kiểm tra trạng thái Git, branch hiện tại và thay đổi local. Không ghi đè hay xóa thay đổi chưa commit của người dùng.
2. Đọc code thực tế trong `frontend/`, API/backend routes, permission contract và cấu hình build. Tài liệu cũ chỉ là tham khảo.
3. Không tự bịa endpoint, KPI, số liệu, nghiệp vụ, dữ liệu demo, chính sách hay trạng thái.
4. Không để dữ liệu mẫu giả trông như dữ liệu thật. Nếu API chưa hỗ trợ một phần UI, ghi rõ tính năng đó chưa có dữ liệu/API và không tạo nút giả hoạt động.
5. Không thay đổi schema, migration, business logic, API contract, authorization hoặc dữ liệu backend.
6. Không coi ẩn tab/nút ở frontend là bảo mật. Backend vẫn là nơi xác thực quyền và scope.
7. Không làm thay đổi ý nghĩa hoặc payload của request API hiện có khi không cần thiết.
8. Không thêm dependency lớn hoặc thư viện UI/chart/table nếu repo hiện có thể giải quyết bằng React/CSS.
9. Không dùng `|| true`, không bỏ test, không tắt security check để làm build/test xanh.
10. Không in token, cookie, secret, mật khẩu hoặc PII vào console/log.

# 3. Khảo sát và lập bản đồ trước khi triển khai

Kiểm tra tối thiểu:

- `frontend/package.json`
- `frontend/src/App.jsx`
- `frontend/src/api.js`
- `frontend/src/main.jsx`
- `frontend/src/styles.css`
- `frontend/src/components/`
- tất cả tab trong `frontend/src/tabs/`
- `backend/src/routes/`
- `backend/src/modules/`
- `docs/contract/roles-permissions.json`
- `docs/contract/openapi.yaml` nếu có
- cấu hình Nginx/Docker có ảnh hưởng tới frontend
- test và CI liên quan tới frontend

Tạo bản đồ nội bộ cho chính quá trình làm việc:
- Tab/feature nào đang có.
- API nào đang được gọi.
- Quyền nào quyết định việc hiển thị.
- Route/action nào chưa có API hoặc đang phụ thuộc endpoint chưa xác minh.
- Các chỗ có tài khoản demo, dữ liệu hardcode hoặc lỗi UX đã xác nhận.

Sau khi khảo sát, triển khai luôn. Không chỉ trả về audit hay thiết kế trên giấy.

# 4. Định hướng giao diện

Thiết kế theo hướng **B2B SaaS ERP hiện đại**, rõ ràng, nghiêm túc, ưu tiên khả năng đọc dữ liệu và hoàn thành công việc hơn hiệu ứng trang trí.

## 4.1 Bố cục ứng dụng

Thiết kế shell thống nhất:

### Desktop
- Sidebar trái có logo BizOps AI, nhóm điều hướng, trạng thái active.
- Có thể thu gọn sidebar nếu không làm tăng độ phức tạp đáng kể.
- Header có:
  - tên trang hiện tại;
  - thông tin user;
  - role/phòng ban;
  - scope dữ liệu nếu API đang trả về;
  - nút đăng xuất.
- Vùng nội dung có chiều rộng và khoảng cách hợp lý; không để bảng tràn toàn màn hình nếu không cần.

### Mobile/tablet
- Sidebar chuyển thành drawer hoặc menu phù hợp với cấu trúc hiện tại.
- Không để menu tab chiếm toàn bộ chiều cao màn hình.
- Bảng lớn có cách cuộn ngang rõ ràng hoặc chuyển thành card nếu phù hợp.
- Form và CTA dùng được bằng thao tác chạm.
- Không có tràn ngang toàn trang ở viewport nhỏ.

### Điều hướng
- Giữ đầy đủ các khu vực hiện có: CEO, Sales, Finance, Ops/Kho, CSKH, Marketing, HR, IT, Legal, QA, Product.
- Có thể gom nhóm điều hướng, nhưng không được làm mất khả năng tới feature hiện có.
- Chỉ hiện module khi quyền hiện tại đáp ứng đúng logic permission đang dùng.
- Chuyển tab/module không được tạo cảm giác quyền UI thay thế authorization backend.
- Nếu vẫn dùng tab nội bộ thay vì router, giữ tương thích với kiến trúc hiện tại; chỉ chuyển sang routing nếu có lợi ích rõ, không làm rewrite vô cớ.

## 4.2 Thiết kế trực quan

Tạo hệ thống token CSS thống nhất cho:
- màu nền, surface, border, text, primary, danger, warning, success;
- spacing;
- radius;
- shadow;
- typography;
- chiều cao input/button;
- breakpoint responsive;
- trạng thái focus/hover/disabled.

Yêu cầu:
- Màu sắc có tương phản dễ đọc, không dựa duy nhất vào màu để truyền trạng thái.
- Dùng font stack hiện có nếu phù hợp; không tải font ngoài không cần thiết.
- Thống nhất button, card, badge, table, input, select, alert, modal, toast.
- Hạn chế inline styles và CSS trùng lặp.
- Tránh animation gây phân tâm; tôn trọng `prefers-reduced-motion`.

# 5. Component dùng chung

Tạo hoặc chuẩn hóa component dùng chung khi có nhiều chỗ tái sử dụng, ví dụ:

- `AppShell`
- `Sidebar`/`MobileNav`
- `PageHeader`
- `SectionCard`
- `StatusBadge`
- `LoadingState`
- `EmptyState`
- `ErrorState`
- `ConfirmDialog`
- `FormField`
- `DataTable` hoặc bộ style table
- `Toast`/notification nếu chưa có giải pháp chung phù hợp

Không tạo abstraction quá mức cho component chỉ dùng một lần. Component phải dễ đọc, props rõ ràng và không chứa business logic nhạy cảm.

# 6. Trạng thái dữ liệu và lỗi API

Chuẩn hóa mọi tab theo các trạng thái sau:

1. **Loading:** có skeleton hoặc trạng thái tải; không nhấp nháy dữ liệu cũ không rõ ràng.
2. **Success:** hiển thị dữ liệu API thật.
3. **Empty:** thông báo chưa có dữ liệu và hành động tiếp theo nếu có ý nghĩa.
4. **Error:** thông báo dễ hiểu, có nút thử lại nếu request có thể retry an toàn.
5. **Unauthorized/Forbidden:**
   - 401 theo đúng cơ chế session/refresh đang có;
   - 403 giải thích người dùng không có quyền;
   - không hiển thị stack trace hoặc lỗi kỹ thuật thô.
6. Tránh gọi API lặp lại vô hạn hoặc retry mutation tự động.
7. Khi đổi tab và quay lại, chỉ giữ cache/state nếu kiến trúc hiện tại hỗ trợ an toàn; không hiển thị dữ liệu cũ như dữ liệu mới.
8. Với mutation, disable nút trong lúc gửi để hạn chế double-submit, nhưng không thay thế idempotency/backend controls.

Không che lỗi bằng `catch(() => null)` rồi hiển thị như dữ liệu hợp lệ. Nếu có fallback im lặng ở code hiện tại, sửa để người dùng nhận được trạng thái lỗi phù hợp.

# 7. Nâng cấp theo từng module

## 7.1 CEO / Tổng quan
- Thay các KPI ghép trong một dòng bằng các thẻ KPI riêng, dễ quét.
- Chỉ hiển thị KPI mà endpoint hiện có thật sự trả về.
- Định dạng tiền VND, phần trăm và ngày thống nhất.
- Tách rõ:
  - tổng quan;
  - phê duyệt đang chờ;
  - cảnh báo vận hành.
- Cảnh báo cần có trạng thái và liên kết tới module xử lý nếu route hiện có.
- Không thêm chart hoặc “so với tháng trước” nếu API không cung cấp dữ liệu cần thiết.

## 7.2 Sales
- Tách rõ các khu vực lead, khách hàng, đơn hàng, báo giá/hợp đồng theo những gì tab hiện đã hỗ trợ.
- Bảng có tiêu đề, trạng thái, ngày và số tiền dễ đọc.
- Các form cần label, validation UX và thông báo kết quả.
- Không cho phép frontend gửi employee/resource ID tùy ý nếu API hiện tại yêu cầu scope hoặc actor của user.

## 7.3 Finance
- Làm rõ công nợ, giao dịch, payment, import CSV, đối soát theo API hiện có.
- Hiển thị số tiền theo VND; thể hiện rõ amount, paid, remaining và due date khi các field có dữ liệu.
- Payment/đối soát/remind là hành động nghiệp vụ: hiển thị xác nhận với số tiền/ref liên quan trước khi gửi.
- Import CSV cần trạng thái đang tải, kết quả imported/skipped/invalid nếu API trả về, và lỗi rõ ràng.
- Không tự tạo Idempotency-Key mới cho từng lần retry nếu logic hiện tại yêu cầu giữ key cho cùng một thao tác; kiểm tra API client và luồng hiện có trước khi sửa.

## 7.4 Ops/Kho
- Tách rõ tồn kho, cảnh báo thấp, stock movement, purchase order và shipment nếu API hiện có.
- Thể hiện trạng thái kho/vận chuyển bằng badge và mô tả text.
- Các thao tác nhập/xuất kho cần xác nhận rõ SKU, số lượng, loại giao dịch trước khi gửi.
- Không tính tồn kho khác với backend hoặc tạo “ước lượng tồn” từ dữ liệu không đầy đủ.

## 7.5 CSKH
- Làm rõ danh sách ticket/chat, trạng thái và thao tác hỗ trợ theo API hiện có.
- Không cho phép UI hiển thị dữ liệu khách hàng ngoài scope server trả về.
- Tránh log nội dung chat hoặc thông tin cá nhân ra console.

## 7.6 Marketing
- Làm rõ campaign, trạng thái và dữ liệu ROI nếu endpoint trả về.
- Không hiển thị ROI giả hoặc biểu đồ từ dữ liệu hardcode.

## 7.7 HR
- Tổ chức danh sách nhân sự, chấm công, tuyển dụng, đào tạo hoặc payroll preview theo feature/API đang có.
- Dữ liệu lương và thông tin cá nhân phải được xử lý tối thiểu, không đưa vào frontend nếu API không cho phép.
- Không tạo UI để lộ field nhạy cảm ngoài permission hiện có.

## 7.8 IT, Legal, QA, Product
- Mỗi tab có PageHeader, trạng thái và cấu trúc bảng/form thống nhất.
- Trạng thái ticket/incident/risk/approval/QA/product feature phải bám contract/API.
- Không cho phép chuyển state tùy ý nếu backend/state machine không hỗ trợ.
- Hành động có thể tác động dữ liệu phải có thông báo kết quả và xác nhận phù hợp.

# 8. Bảo mật và đăng nhập

Kiểm tra đặc biệt:

- Bỏ username/password demo được điền sẵn trong login.
- Không render thông tin mật khẩu demo trong production.
- Nếu cần giữ hướng dẫn tài khoản demo, chỉ bật cho môi trường development một cách rõ ràng; không đưa thông tin đăng nhập thật vào production bundle.
- Giữ nguyên cookie, CSRF, refresh token, credentials và headers hiện có.
- Không chuyển token/cookie vào `localStorage` hoặc URL.
- Không thêm frontend authorization như lớp bảo mật duy nhất.
- Không ghi response chứa PII/token vào console.
- Đăng xuất phải tiếp tục gọi API logout theo luồng hiện có và xóa trạng thái frontend.
- Sau sự kiện session expired, clear user/permission/scope state và điều hướng về login theo cơ chế hiện tại.
- Không hiển thị scope suy đoán; chỉ hiển thị giá trị backend trả về.

# 9. Accessibility và chất lượng tương tác

Đảm bảo:
- dùng semantic HTML phù hợp;
- mọi input có label hoặc accessible name;
- button có tên hành động rõ;
- có keyboard navigation và focus-visible;
- dialog/modal giữ focus và đóng được bằng phím phù hợp;
- không dùng `div` giả làm button/link;
- bảng có header/caption khi phù hợp;
- trạng thái không chỉ phân biệt bằng màu;
- toast không che mất control quan trọng;
- trang dùng được ở desktop, tablet và mobile;
- kiểm tra console không có React key warning hoặc lỗi runtime mới.

# 10. Cách triển khai theo giai đoạn

Thực hiện theo thứ tự, không dừng sau khi chỉ viết kế hoạch:

### Phase A — Audit
- Xác định cấu trúc hiện tại, API thật, quyền và các điểm hỏng.
- Ghi nhận danh sách file sẽ thay đổi.

### Phase B — Design foundation
- Tạo token CSS và component primitives dùng chung.
- Đảm bảo build trước khi chuyển tiếp.

### Phase C — App shell
- Nâng cấp header, sidebar/navigation, layout desktop/mobile, profile/scope/logout.
- Bảo toàn logic permission.

### Phase D — Tab features
- Áp dụng component và states vào đủ 11 tab.
- Bắt đầu từ CEO, Finance, Sales, Ops/Kho; sau đó xử lý các tab còn lại.
- Tận dụng API hiện có, không dựng backend mới.

### Phase E — Security/UX regression
- Xử lý login demo, lỗi API, loading/empty/error, double submit và các hành động cần confirm.
- Kiểm tra không có dữ liệu nhạy cảm lộ ra.

### Phase F — Verification
- Chạy build/test/UI checks hiện có.
- Sửa lỗi mới do thay đổi gây ra.
- Không tuyên bố kiểm tra nào pass nếu chưa chạy.

# 11. Điều kiện nghiệm thu

Hoàn thành khi tất cả điều sau đúng:

- Giao diện có bố cục ERP thống nhất, chuyên nghiệp và responsive.
- Tất cả module hiện có vẫn tới được khi user có đủ quyền.
- Không thay đổi authorization, scope hoặc logic backend.
- Mọi nội dung dữ liệu động lấy từ API thật; không có số liệu giả.
- Mọi màn hình có trạng thái loading/empty/error phù hợp.
- Có xử lý rõ ràng cho 401/403 và lỗi mutation.
- Login không lộ tài khoản/mật khẩu demo trong production.
- Không có link/nút chết hoặc UI báo thành công giả.
- Không phát sinh dependency không cần thiết.
- `frontend` build pass và các test/check hiện có pass.
- Các module chưa thể hoàn thiện do thiếu API được ghi rõ thay vì giả lập.

# 12. Báo cáo sau khi làm

Cuối cùng trả lời bằng tiếng Việt, ngắn gọn nhưng cụ thể:
1. Tóm tắt thay đổi giao diện.
2. Danh sách file chính đã sửa/tạo.
3. Những tab/module đã nâng cấp.
4. Những chức năng bị giới hạn do backend/API chưa hỗ trợ.
5. Lệnh kiểm tra đã chạy và kết quả thật.
6. Các vấn đề còn lại hoặc rủi ro cần người dùng quyết định.

Bắt đầu bằng việc kiểm tra code hiện tại và thay đổi Git. Sau đó thực hiện nâng cấp trực tiếp trong repo, không chỉ đưa ra hướng dẫn.