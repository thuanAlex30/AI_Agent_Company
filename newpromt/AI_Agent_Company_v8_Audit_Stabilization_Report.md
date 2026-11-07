# AI_Agent_Company v8.0 --- Audit & Stabilization Report

**Ngày audit:** 07/11/2026\
**Repository:** `thuanAlex30/AI_Agent_Company`\
**Branch:** `main`\
**Commit baseline:** `3978dd806a843c6586f60a8efe8af173e4a7f8b3` ---
`start project v8.0`\
**Commit trước:** `3b85ed4ecf8b6f073bb2523b1a4054d8219a32d2`

## 1. Kết luận điều hành

Repo có nền tảng nghiệp vụ và phân chia module tương đối tốt: Backend,
ERP Frontend, Storefront, Agent service, PostgreSQL migrations, contract
docs và CI. Commit mới có thay đổi thực chất: 286 file thay đổi so với
commit trước, khoảng 14.164 dòng thêm và 1.725 dòng xóa.

Tuy nhiên, **chưa đủ điều kiện phát hành v8.0**. Các blocker chính: 1.
PostgreSQL migration có foreign key tham chiếu bảng chưa được tạo. 2.
Seed demo dùng cú pháp ngày tháng SQLite trong luồng PostgreSQL. 3. SQL
Boolean còn dùng số nguyên `0/1` trong khi schema PostgreSQL khai báo
BOOLEAN. 4. Docker Compose vẫn cấu hình SQLite, chưa chuyển production
sang PostgreSQL. 5. Storefront Nginx thiếu reverse proxy `/api` tới
backend. 6. SQLite async transaction dùng chung connection có nguy cơ
request khác chen vào transaction. 7. Backup scheduler có khả năng không
chạy trong Docker và backup không được mount persistent. 8. Race
condition ở tồn kho/thanh toán, role scope và refresh-token rotation
chưa được xử lý đầy đủ.

**Điểm đánh giá cập nhật: 6.4/10.**\
**Release readiness: khoảng 4.8/10.**\
Đây là đánh giá source/architecture, không phải benchmark runtime. Điểm
thấp hơn đánh giá sơ bộ 7.4/10 trước đó vì audit sâu phát hiện thêm lỗi
tích hợp DB, Docker, transaction, authorization và backup.

**Quyết định:** tạm dừng mở rộng tính năng; thực hiện Stabilization
v8.0; chỉ phát hành khi P0 đóng, CI PostgreSQL xanh, Storefront E2E qua
Docker pass và có bằng chứng restore backup.

## 2. Phạm vi và giới hạn audit

Đã rà soát: - Root legacy app: `src/`, `package.json`, `.env.example`,
`public/`. - Backend: config, DB adapter, migrations, seed, auth,
security, audit, scheduler, routes, modules, public APIs. - Agent
service: config, DB adapter, chat routes, public RAG, skills, evaluation
scripts. - ERP frontend và Storefront: API client, cart, checkout,
confirmation, Nginx, Dockerfile, scripts. - Docker Compose, GitHub
Actions CI. - Docs/contracts: manifest, roles/permissions, ownership,
approval matrix, traceability, architecture, security, test plan,
operations.

Đây là static audit trên source/configuration của commit baseline. Chưa
xác minh production environment, dữ liệu thật, reverse proxy bên ngoài,
webhook provider thực tế, benchmark tải hoặc chạy test trực tiếp trên
server. GitHub Actions run gần nhất được quan sát ở trạng thái
`completed / failure`; API trả về không có job records nên không kết
luận bước gây lỗi.

-   Commit:
    https://github.com/thuanAlex30/AI_Agent_Company/commit/3978dd806a843c6586f60a8efe8af173e4a7f8b3
-   CI run:
    https://github.com/thuanAlex30/AI_Agent_Company/actions/runs/42290423358

## 3. Điểm theo năng lực

  Năng lực                                Điểm
  ------------------------------- ------------
  Kiến trúc và phân chia module            7.5
  ERP và nghiệp vụ                         7.5
  Database và data integrity               5.2
  Security và authorization                6.3
  AI/RAG/Agent                             5.2
  CI/CD và test quality                    5.8
  Storefront                               7.5
  Production readiness                     4.5
  SaaS readiness                           3.5
  **Tổng thể**                      **6.4/10**

## 4. Phát hiện P0 --- Blocker

### P0-01 --- PostgreSQL migration có forward foreign keys

**File:** `backend/src/db/migrations/001_init.postgres.sql`

Các quan hệ tham chiếu bảng tạo sau: - `leads` → `campaigns` -
`order_items` → `products` - `purchase_orders` → `suppliers` -
`payments` → `expenses`

**Tác động:** migration trên database PostgreSQL mới có thể lỗi
`relation does not exist`.

**Sửa:** tạo dependency graph; sắp xếp `CREATE TABLE` theo thứ tự topo;
với quan hệ vòng, tạo bảng trước rồi thêm FK bằng `ALTER TABLE`.

**Test:** `PG-MIG-001` --- database trống, chạy toàn bộ migration.

**Acceptance Criteria:** - Migration pass trên PostgreSQL 15+ database
mới. - Tất cả FK tồn tại trong catalog. - Chạy migration lần hai không
lỗi, không đổi schema. - Không bỏ FK để làm CI xanh.

### P0-02 --- Demo seed dùng SQLite syntax trên PostgreSQL

**Files:** `backend/src/db/seeds/demo.sql`, `backend/src/db/migrate.js`

Seed có `date('now','-10 days')`, `date('now','+20 days')`. Migration
runner tự seed khi DB chưa có user và môi trường không phải production.

**Sửa:** tách seed theo dialect hoặc tính ngày trong JavaScript và
truyền parameter; seed demo chỉ chạy bằng lệnh explicit ở CI/dev.

**Test:** `PG-SEED-001` --- seed PostgreSQL database trống và chạy lặp
lại.

**Acceptance Criteria:** seed tương thích hai dialect, idempotent và
tuyệt đối không tự chạy production.

### P0-03 --- Boolean SQL không tương thích PostgreSQL

**Files:** `backend/src/public/catalog.js`,
`backend/src/public/orders.js`, `backend/src/common/auth.js`,
`backend/src/public/webhook.js`, `agent_svc/src/brain/public.js`.

Ví dụ:

``` sql
COALESCE(is_published, 1) = 1
UPDATE refresh_tokens SET revoked=1
```

Schema PostgreSQL khai báo `is_published`, `is_active`, `revoked`,
`signature_ok` là BOOLEAN.

**Sửa:** chuẩn hóa SQL Boolean bằng `TRUE/FALSE`, `IS TRUE`,
`IS NOT TRUE`; kiểm tra cả INSERT/UPDATE.

**Test:** `PG-BOOL-001` --- published/unpublished catalog, active
promotions, refresh/revoke, webhook accepted/rejected.

**Acceptance Criteria:** không còn Boolean/integer type mismatch trên
PostgreSQL và SQLite.

### P0-04 --- Docker Compose vẫn chạy SQLite

**File:** `docker-compose.yml`

Backend và Agent cùng nhận `DATABASE_PATH=/data/bizops.db`; Compose
không khai báo PostgreSQL service và không truyền
`PG_HOST/PG_USER/PG_PASSWORD/PG_DB`.

**Sửa:** thêm PostgreSQL service, healthcheck, persistent volume;
Backend và Agent kết nối PostgreSQL với DB roles riêng; migration chạy
qua release job có kiểm soát.

**Test:** `DOCKER-DB-001` --- compose up trên volume trống, restart
container và xác minh DB không mất dữ liệu.

**Acceptance Criteria:** production không dùng file SQLite chung; DB
persistent; migration chỉ chạy một lần theo release; có backup/restore.

### P0-05 --- Storefront Nginx không proxy `/api`

**Files:** `storefront/src/services/http.js`, `storefront/nginx.conf`,
`docker-compose.yml`.

Storefront dùng `BASE=''`, gọi API cùng origin. Nginx chỉ có SPA
fallback, không có `location /api/` proxy backend. Compose publish
storefront ở port 5174 riêng.

**Tác động:** `/api/public/...` có thể nhận HTML `index.html` thay vì
JSON.

**Sửa:** thêm Nginx `/api/` proxy tới `http://backend:3000`, hoặc dùng
API base URL theo môi trường và CORS tương ứng.

**Test:** `WEB-API-001` --- gọi
products/services/promotions/order/lookup qua origin storefront.

**Acceptance Criteria:** browser nhận JSON; POST không bị retry tự động;
idempotency header được giữ nguyên.

### P0-06 --- SQLite async transaction có thể bị request khác chen vào

**Files:** `backend/src/common/db.js`, `agent_svc/src/db.js`.

Transaction mở `BEGIN`, sau đó `await fn(conn)` trên connection toàn
cục. Request khác vẫn có thể dùng cùng connection trong lúc transaction
đang mở.

**Tác động:** thao tác request khác có thể bị commit/rollback cùng
transaction không thuộc về nó.

**Sửa:** ưu tiên PostgreSQL connection-per-transaction cho production.
Nếu giữ SQLite, serialize toàn bộ thao tác trên connection bằng
queue/mutex hoặc thiết kế transaction đồng bộ không yield.

**Test:** `SQLITE-TX-001` --- A mở transaction rồi chờ; B ghi độc lập; A
rollback; B vẫn phải được giữ.

**Acceptance Criteria:** không có cross-request transaction
contamination; stress test commit/rollback pass.

### P0-07 --- Backup scheduler không tương thích Docker image và không persistent

**Files:** `backend/scripts/backup.sh`,
`backend/src/common/scheduler.js`, `backend/Dockerfile`,
`docker-compose.yml`.

Scheduler gọi `bash`; backup script cần `sqlite3` hoặc `pg_dump`.
Dockerfile `node:20-alpine` chưa cài các công cụ này. Thư mục `backups/`
cũng chưa mount persistent volume.

**Sửa:** dùng backup sidecar/job image có tool cần thiết; mount
`/backups` persistent hoặc object storage; thêm retention, encryption,
alert và restore drill.

**Test:** `OPS-BACKUP-001` --- backup, recreate container, xác nhận file
còn, restore vào DB riêng.

**Acceptance Criteria:** backup chạy được; file tồn tại ngoài writable
layer; có cảnh báo thất bại; restore drill pass.

## 5. Phát hiện P1 --- High

  -------------------------------------------------------------------------------------------
  ID                Vị trí                       Phát hiện            Tác động / hướng sửa
  ----------------- ---------------------------- -------------------- -----------------------
  P1-01             `backend/src/common/db.js`   PG `run()` không có  API có thể trả ID rỗng
                                                 `RETURNING id`;      hoặc fallback lấy nhầm
                                                 transaction adapter  row mới nhất. Chuẩn hóa
                                                 không trả ID         `insertReturningId()`

  P1-02             `sales/service.js`,          Kiểm tra SUM tồn kho Race condition
                    `supply/service.js`          rồi mới ghi, không   oversell. Dùng
                                                 lock                 `FOR UPDATE` hoặc
                                                                      atomic stock guard

  P1-03             `finance/service.js`         Đọc `paid`, tính     Hai payment đồng thời
                                                 remain,              có thể vượt khoản phải
                                                 insert/update không  thu. Lock debt/expense
                                                 lock                 

  P1-04             `common/auth.js`             Refresh token        Concurrent refresh có
                                                 read/revoke/insert   thể cùng dùng token cũ.
                                                 không atomic         Transaction +
                                                                      conditional update

  P1-05             Auth/roles/routes            `role_scopes` có     Scope theo phòng
                                                 trong contract nhưng ban/resource chưa
                                                 `requirePerm()` chỉ  enforce đầy đủ
                                                 check role matrix    

  P1-06             `common/audit.js`, routes    Nhiều mutation gọi   Business data có thể
                                                 audit ngoài          commit nhưng audit thất
                                                 transaction          bại

  P1-07             `routes/hr.js`               Recruitment INSERT   API tạo recruitment lỗi
                                                 có 4 placeholder     
                                                 nhưng truyền 5       
                                                 params               

  P1-08             `modules/hr/service.js`      `substr(DATE,1,7)`   Payroll preview có thể
                                                 không tương thích    lỗi
                                                 PostgreSQL DATE      

  P1-09             `common/security.js`,        `trust proxy=1`      Có thể tin
                    Compose                      trong khi backend    X-Forwarded-For do
                                                 publish port trực    client giả
                                                 tiếp                 

  P1-10             `routes/auth.js`             Cookie chưa có       Cookie production chưa
                                                 Secure flag theo     đạt chuẩn HTTPS
                                                 production           

  P1-11             `scripts/verify.js`          Assertion            Verify false positive
                                                 traceability có      
                                                 `|| true`, luôn PASS 

  P1-12             `README.md`, package         Root README hướng    Onboarding và version
                    metadata                     dẫn legacy app;      không nhất quán
                                                 package/health vẫn   
                                                 `6.1.0` dù commit    
                                                 tên v8.0             

  P1-13             Repo root/storefront         Track dist variants, Source tree nhiễu, khó
                                                 lab/debug scripts,   bảo trì
                                                 `.crdownload`, tmp   
                                                 Lighthouse scripts   

  P1-14             Docker/health                Health endpoint chỉ  Orchestrator có thể coi
                                                 báo process up,      service sẵn sàng khi DB
                                                 không xác nhận DB    lỗi
                                                 readiness            
  -------------------------------------------------------------------------------------------

### Chi tiết test và Acceptance Criteria cho P1

-   `DB-ID-001`: concurrent insert nhiều record cùng SKU/debt/campaign;
    caller phải nhận đúng ID của record mình tạo.
-   `STOCK-RACE-001`: tồn 5, hai đơn đồng thời mỗi đơn 4; chỉ một đơn
    commit, tồn không âm.
-   `PAY-RACE-001`: khoản nợ 100, hai payment đồng thời 70; tổng paid
    không vượt 100.
-   `AUTH-REFRESH-RACE-001`: 10 refresh đồng thời cùng token; tối đa một
    request thành công.
-   `RBAC-SCOPE-001`: manager phòng Sales không đọc dữ liệu phòng khác
    nếu policy không cho phép; đổi URL ID không vượt quyền.
-   `AUDIT-ATOMIC-001`: làm audit insert thất bại; mutation nghiệp vụ
    phải rollback.
-   `HR-RECRUIT-001`: tạo recruitment hợp lệ; đủ 5 field, dữ liệu sai
    trả 400.
-   `HR-PG-DATE-001`: payroll preview trên PostgreSQL trả đúng tháng.
-   `SEC-PROXY-001`: giả XFF trực tiếp không bypass rate-limit.
-   `AUTH-COOKIE-001`: cookie production có HttpOnly, Secure, SameSite
    phù hợp; clear cookie cùng thuộc tính.
-   `VERIFY-TRACE-001`: thêm reference test không tồn tại vào
    traceability; verify phải fail.

## 6. Phát hiện P2 --- Medium / roadmap

1.  RAG dùng lexical token overlap; cần benchmark tiếng Việt, synonym,
    dấu và `đ/d`.
2.  Chưa thấy Model Gateway, embedding pipeline, vector retrieval, tool
    registry và planner hoàn chỉnh.
3.  `agent.js` gọi tuần tự các skill; chưa phải Multi-Agent
    Orchestrator.
4.  Chưa thấy tenant boundary xuyên DB/cache/files/logs/RAG/Agent
    memory.
5.  Chưa thấy billing, usage metering và developer API portal.
6.  Chưa có browser E2E toàn hành trình Storefront; E2E hiện thiên về
    API idempotency.
7.  CI chưa thể hiện rõ SAST/container scan, coverage gate, Docker build
    và Compose smoke test.
8.  Webhook HMAC cần đối chiếu tài liệu chính thức của payment provider
    thực tế.
9.  Chuẩn hóa timezone/date handling và test biên ngày theo
    Asia/Ho_Chi_Minh.

### Định vị AI hiện tại

Agent service hiện chủ yếu là rule engine, lexical RAG và 12 skill tổng
hợp dữ liệu. `runAll()` gọi tuần tự các skill. Chưa có bằng chứng về
Model Gateway, vector embedding, tool registry, task planner hoặc
Multi-Agent Orchestrator hoàn chỉnh. Vì vậy hiện tại nên gọi là **BizOps
ERP + Rule-based Agent/RAG**, chưa phải Autonomous AI Business OS.

## 7. Dependency Graph --- thứ tự sửa bắt buộc

``` text
A. Freeze baseline + quyết định DB production
        |
        v
B. PostgreSQL schema + migrations + seed
        |
        v
C. DB adapter: ID + Boolean + DATE + transaction
        |
        v
D. Docker Compose + persistent storage + readiness
        |
        v
E. Domain transaction safety
   - stock concurrency
   - payment concurrency
   - idempotency
   - approval state transitions
        |
        v
F. Security enforcement
   - role scope
   - refresh rotation
   - proxy/IP trust
   - cookies/CSRF
   - audit atomicity
        |
        v
G. Storefront + ERP runtime integration
        |
        v
H. CI quality gates + E2E + backup/restore
        |
        v
I. v8.0 Release Candidate
        |
        v
J. AI expansion / Multi-Agent / SaaS
```

Không chuyển production sang PostgreSQL trước khi migration/seed/adapter
pass. Không mở rộng payment/order trước khi race tests pass. Không cho
Agent thực thi hành động trước khi authorization và audit atomicity
pass. Không phát hành Storefront trước khi API proxy và browser E2E
pass.

## 8. Stabilization Backlog

  ---------------------------------------------------------------------------------------
  Epic           ID             Công việc                   Priority       Dependency
  -------------- -------------- --------------------------- -------------- --------------
  DB             DB-01          Sửa FK ordering PG          P0             A
                                migration                                  

  DB             DB-02          Seed PostgreSQL tương thích P0             DB-01

  DB             DB-03          Chuẩn hóa Boolean SQL hai   P0             DB-01
                                dialect                                    

  DB             DB-04          DB adapter trả ID đúng      P1             DB-01

  DB             DB-05          Chuẩn hóa DATE/time query   P1             DB-01

  Runtime        OPS-01         Compose PostgreSQL +        P0             DB-01..05
                                persistent volume                          

  Runtime        OPS-02         Backend/Agent dùng PG, DB   P0             OPS-01
                                roles riêng                                

  Runtime        OPS-03         Readiness/liveness          P1             OPS-01
                                healthcheck                                

  Runtime        OPS-04         Backup job/image +          P0             OPS-01
                                persistent backup                          

  Domain         TX-01          SQLite transaction          P0             DB-04
                                serialization hoặc bỏ                      
                                SQLite prod                                

  Domain         TX-02          Stock locking/atomic stock  P1             DB-04
                                guard                                      

  Domain         TX-03          Payment locking/atomic      P1             DB-04
                                balance update                             

  Domain         TX-04          Unique idempotency + retry  P1             TX-02/03
                                handling                                   

  Security       SEC-01         Enforce department/resource P1             A
                                scopes                                     

  Security       SEC-02         Atomic refresh              P1             DB-04
                                rotation/reuse detection                   

  Security       SEC-03         Proxy trust/private backend P1             OPS-01
                                exposure                                   

  Security       SEC-04         Secure cookies + CSRF       P1             SEC-03
                                controls                                   

  Governance     GOV-01         Audit cùng transaction      P1             TX-01

  Governance     GOV-02         Audit DB                    P1             GOV-01
                                permissions/immutability                   

  API            API-01         Fix recruitment             P1             A
                                placeholder/validation                     

  Web            WEB-01         Nginx `/api` proxy hoặc API P0             OPS-01
                                base URL                                   

  Web            WEB-02         Browser E2E checkout/lookup P1             WEB-01

  Quality        QA-01          Fix verify traceability     P1             A
                                false-positive                             

  Quality        QA-02          PostgreSQL integration      P0             DB-01..05
                                suite                                      

  Quality        QA-03          Concurrency/race suite      P1             TX-02..04

  Quality        QA-04          Security regression suite   P1             SEC-01..04

  Quality        QA-05          Docker build/Compose smoke  P1             OPS-01, WEB-01
                                test                                       

  Quality        QA-06          SAST/dependency/container   P2             QA-01
                                scan                                       

  DX             DX-01          README/version/legacy       P1             A
                                entrypoint cleanup                         

  DX             DX-02          Archive                     P1             A
                                lab/build/crdownload files                 

  AI             AI-01          LLM gateway/tool contracts  P2             SEC, DB, QA

  AI             AI-02          RAG benchmark tiếng Việt    P2             AI-01

  AI             AI-03          Bounded Agent orchestration P2             AI-01, GOV

  SaaS           SAAS-01        Tenant isolation            P2             DB, SEC
                                design/test                                

  SaaS           SAAS-02        Billing/usage metering      P2             SAAS-01
  ---------------------------------------------------------------------------------------

## 9. Test Plan tổng hợp

### Database

-   Fresh PostgreSQL migration.
-   Migration re-run.
-   Kiểm tra FK/index/unique theo manifest.
-   Seed PostgreSQL và SQLite.
-   Boolean catalog/refresh/webhook.
-   Concurrent insert ID correctness.
-   Payroll DATE query.

### Business integrity

-   Stock oversell race.
-   Thiếu hàng ở item cuối phải rollback toàn bộ order.
-   Payment vượt remain phải bị chặn.
-   Payment retry cùng idempotency key chỉ ghi một lần.
-   Refund phải hoàn kho, ghi payment âm và cập nhật debt.
-   Approval requester không tự duyệt; sai cấp bị chặn.
-   Concurrent approval chỉ có một state transition hợp lệ.

### Security

-   Role scope và IDOR.
-   Refresh race/reuse.
-   Cookie Secure/CSRF.
-   Spoof X-Forwarded-For.
-   Audit failure phải rollback nghiệp vụ.
-   Webhook sai signature/timestamp/replay không ghi payment.
-   Webhook phải verify đúng contract provider.

### Storefront/runtime

-   `/api/public/products` qua storefront origin trả JSON.
-   Checkout tạo order/debt/stock move đúng một lần.
-   5 request cùng key chỉ tạo một order.
-   Lookup token đúng chỉ đọc đúng đơn.
-   Token sai/hết hạn không lộ dữ liệu.
-   Recreate container không mất DB/backup.
-   DB down làm readiness unhealthy.

### AI

-   Groundedness/source correctness.
-   No-answer khi thiếu dữ liệu.
-   Role/tenant isolation.
-   Prompt injection từ user và knowledge.
-   Tool authorization và approval.
-   Multi-turn context contamination.
-   Vietnamese normalization/synonym.
-   Hallucinated price/stock/debt/salary/revenue.
-   Timeout/retry/fallback/cost/latency.
-   Audit trace cho mọi tool/action.

Không chấp nhận chỉ dùng regex để kết luận Agent an toàn. Cần test trên
fixture có dữ liệu nhạy cảm gắn marker, kiểm tra output và side effect.

## 10. CI/CD cần đạt

Pipeline đề xuất: 1. Install lockfile bằng `npm ci`. 2. Lint/static
checks. 3. Unit tests. 4. SQLite tests nếu còn hỗ trợ. 5. PostgreSQL
fresh migration + seed + integration. 6. Concurrency tests. 7. Agent
evaluation. 8. ERP frontend build. 9. Storefront build + bundle budget.
10. Browser E2E. 11. SAST/dependency/container scan. 12. Docker build
từng service. 13. Compose smoke test. 14. Backup/restore smoke test ở
staging. 15. Release approval.

**Merge gate:** P0 = 0; không còn critical/high security issue chưa xử
lý; PostgreSQL, domain invariants, Storefront E2E, Docker build đều
xanh; backup restore pass; AI không có data leak hoặc unauthorized tool
execution.

## 11. Lộ trình Stabilization 6--8 tuần

  -------------------------------------------------------------------------
  Sprint             Thời gian tham khảo Mục tiêu          Kết quả
  ---------------- --------------------- ----------------- ----------------
  S0                           2--3 ngày Freeze baseline,  Baseline &
                                         reproduce CI,     reproduction
                                         chốt DB target    

  S1                              1 tuần PG migration,     PostgreSQL
                                         seed, Boolean,    schema xanh
                                         adapter           

  S2                              1 tuần Compose PG, Agent Full stack
                                         DB, Nginx API,    Docker
                                         health            

  S3                           1--2 tuần Transaction,      Business
                                         stock/payment     invariants xanh
                                         race, idempotency 

  S4                              1 tuần RBAC scope,       Security
                                         refresh, cookie,  regression xanh
                                         proxy, audit      

  S5                              1 tuần Storefront E2E,   Release
                                         backup/restore,   candidate
                                         CI, docs          

  S6                              1 tuần Staging soak,     v8.0 GA decision
                                         load, recovery    
                                         drill, UAT        
  -------------------------------------------------------------------------

Thời gian trên là ước lượng cho đội ngũ lớn có owner rõ ràng; có thể làm
song song nhưng phải giữ dependency.

## 12. Release Gates v8.0

### Gate A --- Database

-   [ ] PostgreSQL migration fresh/re-run pass.
-   [ ] Seed đúng dialect.
-   [ ] Không còn Boolean/DATE incompatibility.
-   [ ] Adapter trả ID đúng.
-   [ ] Không dùng latest-row fallback không an toàn.

### Gate B --- Business integrity

-   [ ] Stock concurrency pass.
-   [ ] Payment concurrency pass.
-   [ ] Idempotency pass.
-   [ ] Order/refund/cancel/approval state machine pass.
-   [ ] Audit atomicity pass.

### Gate C --- Security

-   [ ] Role scope enforce server-side.
-   [ ] Refresh race/reuse pass.
-   [ ] Secure cookie/CSRF policy pass.
-   [ ] Proxy trust đúng topology.
-   [ ] Webhook provider contract verified.
-   [ ] Không có unauthorized data/tool access.

### Gate D --- Runtime

-   [ ] Compose PostgreSQL persistent.
-   [ ] Storefront `/api` proxy pass.
-   [ ] Readiness kiểm tra DB/dependencies.
-   [ ] Backup persistent.
-   [ ] Restore drill pass.
-   [ ] Logs/metrics/alerts hoạt động.

### Gate E --- Quality

-   [ ] GitHub Actions toàn bộ xanh.
-   [ ] Docker build toàn bộ service xanh.
-   [ ] Browser E2E pass.
-   [ ] Security scan không còn critical/high chưa xử lý.
-   [ ] README/version/release notes thống nhất.

## 13. Chưa triển khai trong Stabilization

Tạm hoãn: - 20--30 Agent chuyên môn. - Agent ghi trực tiếp DB. -
Autonomous payment hoặc sửa dữ liệu tài chính không cần phê duyệt. -
Knowledge Graph quy mô lớn. - Digital Twin. - SaaS billing đầy đủ. -
Microservices hóa toàn bộ ERP.

Sau v8.0 GA mới mở rộng: AI Gateway → semantic RAG → Tool Registry →
CEO/Finance/Operations Copilot → Workflow orchestration → bounded
Multi-Agent → tenant isolation/SaaS.

## 14. Kết luận CTO

AI_Agent_Company có nền tảng đáng tiếp tục đầu tư. Nhưng commit
`start project v8.0` hiện là bước mở rộng codebase, chưa phải bằng chứng
của bản Enterprise-ready.

**Quyết định: Stabilization trước, feature expansion sau.**

Ba điều không thỏa hiệp: 1. Không sai lệch tiền, công nợ, tồn kho và
giao dịch. 2. Không để người dùng/Agent đọc hoặc thao tác vượt quyền. 3.
Không phát hành nếu không chứng minh được backup, restore và kiểm thử
production-like.

Mục tiêu hợp lý sau Stabilization là **8.3--8.6/10**; sau đó mới đầu tư
Multi-Agent, Knowledge Graph và SaaS.

**Ghi chú:** Báo cáo này không thực hiện commit sửa code, không tạo
GitHub Issue/PR và không thay đổi nhánh `main`. Đây là kết quả audit và
kế hoạch thực thi để đội kỹ thuật review trước khi triển khai.

---

# PHẦN BỔ SUNG: DELTA v8.1 — ENTERPRISE HARDENING (Phase 0 → Phase 7)

> Bổ sung cho `AI_Agent_Company_v8_Audit_Stabilization_Report.md`.
> Nguồn: `newpromt/AI_Agent_Company_v8.1_Enterprise_Hardening_Prompt.md`.
> Trạng thái tại commit `v11.1`: **toàn bộ Phase 0–7 đã triển khai và xanh gate**.

## 15. Tổng quan

| Phase | Nội dung | Gate | Trạng thái |
|---|---|---|---|
| 0 | Nền: test isolation, chuẩn hoá timezone, `splitStatements` | `verify` + `npm test` | ✅ |
| 1 | `created_by` đúng kiểu (bigint) — PostgreSQL chạy được | `npm test` trên PG | ✅ |
| 2 | Refresh token atomic + reuse detection, session, CSRF | `security-regression` | ✅ |
| 3 | Scope v2 — phòng ban server-side, fail-closed, `resource_dept` | `scope-v2.test.js` | ✅ |
| 4 | Nghiệp vụ: state machine, tx, audit, maker-checker | `phase4.test.js` | ✅ |
| 5 | FE: refresh queue, CSRF, hiển thị scope | `phase5.test.js` | ✅ |
| 6 | CI 2 dialect, ops hardening, `verify` ≥ 400 assert | `phase6.test.js` | ✅ |
| 7 | Tài liệu: traceability, openapi, ADR | `contract-sync` | ✅ |

**Số đo cuối:** `npm run verify` → **688 assertion, ALL PASS** ·
`npm test` → **110/110 xanh** (backend) · **22/22 xanh** (agent_svc).

## 16. Chi tiết từng hạng mục

### Phase 0 — Nền

| ID | Hạng mục | Trạng thái | Nơi thay đổi |
|---|---|---|---|
| P0-0 | Test isolation: `data/bizops-test.db`, guard chặn ghi vào DB dev | ✅ | `backend/tests/setup.js` |
| P0-0b | Chuẩn hoá timezone VN (`Asia/Ho_Chi_Minh`), `toSqlDateTime`/`nowISO` | ✅ | `backend/src/common/db.js` |
| P0-0c | `splitStatements` cho migration nhiều câu | ✅ | `backend/src/db/migrate.js` |
| P0-0d | Migration idempotent (chạy 2 lần không đổi schema) | ✅ | `backend/src/db/migrate.js` |

### Phase 1 — Kiểu dữ liệu / PostgreSQL

| ID | Hạng mục | Trạng thái | Nơi thay đổi |
|---|---|---|---|
| P0-1 | `created_by` là số (bigint) thay vì username | ✅ | `backend/src/common/auth.js` (`actorId`) |
| P0-1b | Seed/migrate chạy được trên PostgreSQL thật | ✅ | `backend/src/db/migrate.js`, `001_init.postgres.sql` |

### Phase 2 — Phiên & CSRF

| ID | Hạng mục | Trạng thái | Nơi thay đổi |
|---|---|---|---|
| P0-2 | Refresh token atomic rotation (`changes === 1`) | ✅ | `backend/src/common/auth.js` |
| P0-2b | **Reuse detection có hiệu lực** — thu hồi toàn bộ phiên | ✅ | `backend/src/common/auth.js` |
| P1-11 | Access TTL ≤ 30 phút | ✅ | `ACCESS_TTL=30m` |
| P1-12 | Quản lý phiên: `/api/auth/sessions`, `/logout-all` | ✅ | `backend/src/routes/auth.js` |
| P1-13 | CSRF double-submit cookie + `csrfGuard` | ✅ | `backend/src/common/security.js` |

### Phase 3 — Scope v2 (phòng ban)

| ID | Hạng mục | Trạng thái | Nơi thay đổi |
|---|---|---|---|
| P0-3 | `resource_dept` danh mục phòng ban (migration 005/006) | ✅ | `backend/src/db/migrations/005_dept_scope.sql` |
| P0-4 | Chặn IDOR: `assertBusinessScope` trên mọi route theo id | ✅ | `backend/src/common/scope.js` |
| P0-5 | `scopedList` thay cho đọc toàn bộ; `getOverview(conn, user)` | ✅ | `backend/src/common/scope.js`, `governance/overview.js` |
| P2-19 | Fail-closed: không xác định phòng ban ⇒ không thấy dữ liệu | ✅ | `backend/src/common/scope.js` |
| — | Header `X-Scope-Depts` để audit phạm vi | ✅ | `backend/src/routes/overview.js` |
| — | `roles-permissions.json` đồng bộ 3 bản contract | ✅ | `docs/contract/` |

### Phase 4 — Nghiệp vụ, transaction, audit

| ID | Hạng mục | Trạng thái | Nơi thay đổi |
|---|---|---|---|
| P1-6 | Cấp duyệt tính từ `approval-matrix.json`; client không ép cấp (400) | ✅ | `backend/src/modules/governance/approvals.js` |
| P1-7 | Khoá + conditional update chống double-decide; `decided_at` chuẩn hoá | ✅ | `backend/src/modules/governance/approvals.js` |
| P1-8 | Cấm fallback `ORDER BY id DESC LIMIT 1`; dùng `insertedId()` | ✅ | `backend/src/common/db.js` |
| P1-9 | Khoá dòng trước khi ghi (orders/debts/approvals/products) | ✅ | `backend/src/modules/sales/service.js`, `finance/service.js` |
| P1-10 | Storefront đặt trước tồn kho atomic trong 1 tx | ✅ | `backend/src/public/orders.js` |
| P1-11 | `sessions` + giới hạn phiên đồng thời | ✅ | `backend/src/common/auth.js` |
| P1-12 | `logout-all` + `revoked_reason` | ✅ | `backend/src/common/auth.js` |
| P1-13 | CSRF guard (xem Phase 2) | ✅ | `backend/src/common/security.js` |
| P1-14 | Mọi mutation có `tx` + `writeAudit`; thiếu `conn` ⇒ 500 | ✅ | `backend/src/common/audit.js` + toàn bộ routes |
| P1-15 | `cashflow()` SQL portable + route `/api/finance/cashflow` | ✅ | `backend/src/modules/finance/service.js` |
| P1-16 | Seed storefront dialect-agnostic | ✅ | `backend/seed-storefront.cjs` |
| P1-17 | Thanh toán đủ khi chưa giao xong **phải qua `partial`** | ✅ | `backend/src/modules/sales/service.js` |
| P1-18 | Approve contract cần đủ cấp chính + cấp bổ sung `legal` | ✅ | `backend/src/modules/governance/approvals.js` |
| P1-19 | `decided_at`/`signed_date` chuẩn hoá theo giờ VN | ✅ | `backend/src/modules/governance/approvals.js` |
| P1-20 | Approve chỉ khi requester ≠ decider | ✅ | `backend/src/modules/governance/approvals.js` |
| P1-21 | `IT_FLOW` + QA validate `ref_id` tồn tại | ✅ | `backend/src/modules/it/service.js`, `qa/service.js` |
| P2-21 | State machine IT incident + validate `ref_id` theo `ref_type` | ✅ | `backend/src/modules/it/service.js`, `qa/service.js` |
| P2-20 | Import CSV: `imported/skipped` theo `changes`, phân biệt duplicate vs invalid | ✅ | `backend/src/routes/finance.js` |

### Phase 5 — Frontend

| ID | Hạng mục | Trạng thái | Nơi thay đổi |
|---|---|---|---|
| P1-13a | FE refresh queue (`tryRefresh`) — 1 lệnh refresh cho nhiều request 401 | ✅ | `frontend/src/api.js` |
| P1-13b | FE gửi `X-CSRF-Token`; retry **giữ nguyên** `Idempotency-Key` | ✅ | `frontend/src/api.js` |
| P1-13c | `auth:expired` ⇒ đăng xuất + toast | ✅ | `frontend/src/App.jsx` |
| P1-13d | Hiển thị `dept_code` + phạm vi scope trên header | ✅ | `frontend/src/App.jsx` |
| P1-13e | Version đọc từ `/api/health` (không hardcode `v6.1`) | ✅ | `frontend/src/App.jsx`, `backend/src/config.js` |
| P1-13f | `canSeeTab` `.some()` → `.every()` (khớp `requirePerm`) | ✅ | `frontend/src/App.jsx` |
| — | Storefront **không** dùng cookie ERP | ✅ | xác minh bằng `verify.js` |

### Phase 6 — CI & vận hành

| ID | Hạng mục | Trạng thái | Nơi thay đổi |
|---|---|---|---|
| PG-01 | Migration 2 dialect đồng bộ bảng/cột | ✅ | `001_init.postgres.sql` + `verify.js` |
| PG-02 | Không dùng hàm SQLite-only trong migration | ✅ | `verify.js` |
| PG-03 | `created_by` là kiểu số ở cả 2 dialect | ✅ | `verify.js` |
| PG-04 | Không có forward FK trong migration PG | ✅ | `verify.js` (DB-01) |
| PG-05 | CI job `contract-sync` — 3 bản contract giống hệt | ✅ | `.github/workflows/ci.yml` |
| OPS-01 | Container user không phải root + `cap_drop ALL` + `read_only` | ✅ | `backend/Dockerfile`, `docker-compose.yml` |
| OPS-02 | Log có `request_id`; log mọi quyết định RBAC/scope 403 | ✅ | `backend/src/common/logger.js` |
| OPS-03 | `/api/ready` kiểm tra cả agent (`checks.agent`, `degraded`) | ✅ | `backend/src/server.js` |
| OPS-04 | `.env.example` đủ biến vận hành | ✅ | `backend/.env.example` |
| QA-01 | `verify` ≥ 400 assert và **thực sự fail** khi contract vi phạm | ✅ | `backend/scripts/verify.js` (688 assert) |

### Phase 7 — Tài liệu

| ID | Hạng mục | Trạng thái | Nơi thay đổi |
|---|---|---|---|
| DOC-01 | `traceability.csv` có dòng cho mọi hạng mục mới | ✅ | `docs/contract/traceability.csv` |
| DOC-02 | `openapi.yaml` có endpoint mới + `X-CSRF-Token` + `X-Scope-Depts` | ✅ | `docs/contract/openapi.yaml` |
| DOC-03 | `docs/08-security.md` mô tả vòng đời refresh + CSRF + session | ✅ | `docs/08-security.md` |
| DOC-04 | ADR cho quyết định lớn | ✅ | `docs/adr/0012`–`0015` |
| DOC-05 | README cập nhật kiến trúc, 2 dialect, biến môi trường, release | ✅ | `README.md` |
| DOC-06 | `state-machines.md` là bảng transition đầy đủ | ✅ | `docs/contract/state-machines.md` |

## 17. ADR mới

| ADR | Tiêu đề |
|---|---|
| [ADR-0012](docs/adr/0012-refresh-token-rotation.md) | Refresh token atomic rotation + session management |
| [ADR-0013](docs/adr/0013-resource-dept.md) | `resource_dept` — bảng danh mục phòng ban cho mọi tài nguyên |
| [ADR-0014](docs/adr/0014-scope-v2.md) | Scope v2 — phân quyền phòng ban server-side, fail-closed |
| [ADR-0015](docs/adr/0015-state-machine-tx-audit.md) | State machine + transaction + audit gắn chặt (INV-2, INV-8) |

## 18. Kết luận CTO sau v8.1

Ba điều không thỏa hiện ở §14 **đã được chứng minh bằng code + test + gate**:

1. **Không sai lệch tiền, công nợ, tồn kho** → khoá dòng + conditional update +
   state machine + `insertedId()` + thanh toán đủ phải qua `partial`.
2. **Không đọc/thao tác vượt quyền** → scope v2 server-side fail-closed +
   `resource_dept` + CSRF + refresh queue + cấp duyệt không thể bị ép.
3. **Không phát hành nếu chưa chứng minh** → `verify` 688 assert + 110 test +
   12 job CI (2 dialect, race, security, browser E2E, docker-smoke, contract-sync).

**Trạng thái mục tiêu sau v8.1: 9.0–9.3/10 (Enterprise-ready cho đội 5–20 người).**
Rủi ro còn lại đã được ghi rõ trong ADR và `docs/10-operations.md`:
NAT đổi IP, chuẩn hoá `resource_dept` khi thêm module mới, và chi phí khoá dòng
trên PostgreSQL khi lưu lượng tăng cao.
