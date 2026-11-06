import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ChatWidget from './components/ChatWidget.jsx';
import Home from './pages/Home.jsx';
import Catalog from './pages/Catalog.jsx';
import Detail from './pages/Detail.jsx';
import Services from './pages/Services.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Confirm from './pages/Confirm.jsx';
import Lookup from './pages/Lookup.jsx';
import SearchPage from './pages/SearchPage.jsx';
import Promos from './pages/Promos.jsx';
import Support from './pages/Support.jsx';
import './styles.css';

export default function App() {
  const [toasts, setToasts] = useState([]);
  function toast(msg) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home toast={toast} />} />
          <Route path="/san-pham" element={<Catalog toast={toast} />} />
          <Route path="/san-pham/:slug" element={<Detail toast={toast} />} />
          <Route path="/dich-vu" element={<Services toast={toast} />} />
          <Route path="/gio" element={<Cart />} />
          <Route path="/thanh-toan" element={<Checkout toast={toast} />} />
          <Route path="/xac-nhan" element={<Confirm />} />
          <Route path="/tra-cuu" element={<Lookup toast={toast} />} />
          <Route path="/tim-kiem" element={<SearchPage toast={toast} />} />
          <Route path="/khuyen-mai" element={<Promos />} />
          <Route path="/ho-tro" element={<Support />} />
          <Route path="*" element={<div className="card">Không thấy trang. <a href="/">Về cửa hàng</a></div>} />
        </Routes>
      </Layout>
      <ChatWidget />
      <div id="toast">{toasts.map((t) => <div className="toast" key={t.id}>{t.msg}</div>)}</div>
    </BrowserRouter>
  );
}
