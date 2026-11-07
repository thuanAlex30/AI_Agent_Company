# Archive — v8.0 Stabilization (DX-02)

Thư mục này chứa **artifact đã bị loại khỏi source tree** nhưng vẫn giữ lịch
sửử để tra cứu. Không chạy/gọi trực tiếp từ CI hay runtime.

## `legacy-root-app/`

App prototype v6.0 từng nằm ở `src/` + `package.json` ở repo root. Đã bị
thay thế hoàn toàn bởi `backend/` (Express API + migrations + tests) và
`frontend/` (ERP React).

| File | Vai trò cũ |
|---|---|
| `src/server.js` | Server Express prototype (đối soát, công nợ, CSKH) |
| `src/modules/reconciliation.js` | Đối soát CSV (đã chuyển `backend/src/modules/finance`) |
| `src/modules/debt.js` | Công nợ (đã chuyển `backend/src/modules/finance`) |
| `src/modules/cskh.js` | CSKH rule-based (đã chuyển `agent_svc`) |
| `src/agent/agent.js` | Agent tổng hợp (đã chuyển `agent_svc/src/agent`) |
| `src/db.js` | DB adapter SQLite prototype |
| `public/index.html` | Trang tĩnh prototype |
| `package.json` | Root manifest prototype (v0.1.0) |

> Không còn `npm start` ở repo root. Dùng `cd backend && npm start`.

## `storefront-lab-scripts/`

99 script đo lường/debug storefront (A/B lab, Lighthouse drill-down, CSS
bisect, font metrics, TBT/LCP tracing…). Được dùng trong quá trình tối ưu
bundle nhưng **không thuộc pipeline build/test**.

Giữ lại ở `storefront/scripts/` (có trong `package.json` + CI):
`analyze-bundle.cjs`, `bench.cjs`, `check-bundle.cjs`, `e2e-idempotency.cjs`,
`lh-median.cjs`, `lighthouse.cjs`, `serve-gzip.cjs`, `subset-fonts.py`,
`ui-check.cjs`, `_subset-chars.txt`.

## `newpromt-downloads/`

File `.crdownload` tải dở từ Chrome (prompt/report cũ). Đã chuyển khỏi
`newpromt/` và `.gitignore` bổ sung `*.crdownload` để không tái phát.

## `newpromt/AI_Agent_Company_v8_Audit_Stabilization_Report.md`

Báo cáo audit gốc — vẫn nằm ở `newpromt/` (không phải artifact loại).
