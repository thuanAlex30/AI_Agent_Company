// App.jsx — Shell + routing.
//
// B2 chia ma theo route (React.lazy + Suspense) — JS ban dau giam, cac trang tai ve sau
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ToastProvider, useToast } from './components/ui/Toast.jsx';
import { SkeletonCard } from './components/ui/Skeleton.jsx';
import Landing from './pages/Landing.jsx';

const DemoFb = lazy(() => import('./pages/DemoFb.jsx'));

const Catalog = lazy(() => import('./pages/Catalog.jsx'));
const Detail = lazy(() => import('./pages/Detail.jsx'));
const Services = lazy(() => import('./pages/Services.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const Confirm = lazy(() => import('./pages/Confirm.jsx'));
const Lookup = lazy(() => import('./pages/Lookup.jsx'));
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'));
const Promos = lazy(() => import('./pages/Promos.jsx'));
const Support = lazy(() => import('./pages/Support.jsx'));
// ChatWidget lazy: phu add-on, khong can nam trong JS ban dau
const ChatWidget = lazy(() => import('./components/ChatWidget.jsx'));

function RouteFallback() {
  return (
    <div className="grid" style={{ marginTop: 'var(--s-4)' }}>
      {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
    </div>
  );
}

function NotFound() {
  return (
    <div className="ui-state">
      <h1 className="ui-state-title" style={{ fontSize: 'var(--fs-3xl)' }}>404</h1>
      <p className="ui-state-desc">Không tìm thấy trang bạn đang tìm.</p>
      <Link className="ui-btn btn-primary" to="/">Về trang chủ</Link>
    </div>
  );
}

function Shell() {
  const toast = useToast();
  return (
    <ErrorBoundary name="shell">
      <Layout>
        <ErrorBoundary name="page">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing toast={toast} />} />
              <Route path="/demo-fb" element={<DemoFb toast={toast} />} />
              <Route path="/san-pham" element={<Catalog toast={toast} />} />
              <Route path="/san-pham/:slug" element={<Detail toast={toast} />} />
              <Route path="/dich-vu" element={<Services toast={toast} />} />
              <Route path="/gio" element={<Cart toast={toast} />} />
              <Route path="/thanh-toan" element={<Checkout toast={toast} />} />
              <Route path="/xac-nhan" element={<Confirm toast={toast} />} />
              <Route path="/tra-cuu" element={<Lookup toast={toast} />} />
              <Route path="/tim-kiem" element={<SearchPage toast={toast} />} />
              <Route path="/khuyen-mai" element={<Promos toast={toast} />} />
              <Route path="/ho-tro" element={<Support toast={toast} />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Layout>
      <Suspense fallback={null}>
        <ChatWidget />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </ToastProvider>
  );
}
