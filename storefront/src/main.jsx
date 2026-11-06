// main.jsx — Entry + mount.
//
// SPEC §7.1/§7.2: LCP chi duoc ghi MOT lan, o thoi diem paint DAU TIEN.
//
// index.html chua STATIC SHELL (hero + H1) de H1 paint ngay tu HTML ma khong
// phai doi JS tai + phan tich + render React.
//
// Vấn đề (đo bằng PerformanceObserver, scripts/bench.cjs + scripts/lcp-elements.cjs):
//   `createRoot().render()` của React 18 XOÁ #root rồi vẽ lại. Nếu React mount
//   TRƯỚC lúc trình duyệt kịp paint, shell bị xoá TRƯỚC lần paint đầu tiên →
//   ứng viên LCP đầu (H1 của shell) bị MẤT → Chrome chỉ ghi LCP ở thời điểm React
//   vẽ xong (~2.9–3.4 s) → vượt ngân sách 2.5 s.
//
// Cách sửa: cho trình duyệt PAINT shell trước, rồi mới mount React.
//   - `requestAnimationFrame`: trình duyệt commit một frame (paint shell).
//   - `setTimeout(..., 0)`: là MACROTASK → chạy SAU bước render của frame đó →
//     React mount SAU khi shell đã paint.
//   - H1 của React có CÙNG kích thước với H1 của shell (cùng CSS inline) →
//     Chrome KHÔNG ghi lại LCP (LCP chỉ cập nhật khi ứng viên MỚI có diện tích
//     LỚN HƠN ứng viên hiện tại).
import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/fonts.css';
import './styles/art.css';
import './styles/ui.css';
import './styles.css';
import App from './App.jsx';

const container = document.getElementById('root');

/**
 * PRELOAD chunk cua route hien tai — loai bo "waterfall" lazy-load.
 *
 * Vấn đề (đo bằng scripts/route-preload-lab.cjs + scripts/timeline.cjs, Slow 4G):
 *   Route dung `React.lazy` -> chunk route chi duoc tai SAU khi index.js da
 *   chay xong va render. Day la 1 ROUND-TRIP thua (150ms RTT) + them mot lan
 *   parse/compile chunk. Timeline that tren /san-pham:
 *       421ms  vendor-react.js  (bat dau tai)
 *      4263ms  Catalog.js       (route chunk — sau khi app da render)
 *   -> UI chi co the hien san pham o ~4.4s -> TBT cao.
 *
 * Cách sửa: `import()` chunk route NGAY khi module index.js chay (song song voi
 *   viec React mount). Dynamic import khong block render, nhung browser bat dau
 *   tai chunk ngay -> chunk san dung khi React can.
 *   => giu duoc lợi ích "chi tai chunk can dung" + bo duoc 1 RTT.
 */
function preloadRouteChunk() {
  const path = window.location.pathname;
  const MAP = {
    '/': null, // Home da la import tinh -> da nam trong bundle chinh
    '/san-pham': () => import('./pages/Catalog.jsx'),
    '/dich-vu': () => import('./pages/Services.jsx'),
    '/gio': () => import('./pages/Cart.jsx'),
    '/thanh-toan': () => import('./pages/Checkout.jsx'),
    '/xac-nhan': () => import('./pages/Confirm.jsx'),
    '/tra-cuu': () => import('./pages/Lookup.jsx'),
    '/tim-kiem': () => import('./pages/SearchPage.jsx'),
    '/khuyen-mai': () => import('./pages/Promos.jsx'),
    '/ho-tro': () => import('./pages/Support.jsx'),
  };
  let key = path;
  if (path.indexOf('/san-pham/') === 0) key = '/san-pham';
  const loader = MAP[key];
  if (!loader) return;
  // ChatWidget: phu add-on, tai song song de mo FAB ngay.
  import('./components/ChatWidget.jsx').catch(() => {});
  // Dynamic import: bat dau tai ngay, khong block.
  loader().catch(() => {});
}
function mountApp() {
  if (!container) return;
  preloadRouteChunk();
  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if (typeof window.requestAnimationFrame === 'function') {
  window.requestAnimationFrame(() => {
    window.setTimeout(mountApp, 0);
  });
} else {
  window.setTimeout(mountApp, 0);
}
