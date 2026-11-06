import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { cartCount } from '../store/cart.js';
import Icon from './ui/Icon.jsx';
import { OfflineBanner } from './ui/States.jsx';

const TOP_NAV = [
  { to: '/', label: 'Cửa hàng', end: true },
  { to: '/san-pham', label: 'Thực đơn' },
  { to: '/dich-vu', label: 'Dịch vụ' },
  { to: '/khuyen-mai', label: 'Khuyến mãi' },
  { to: '/tra-cuu', label: 'Tra cứu' },
  { to: '/ho-tro', label: 'Hỗ trợ' },
];

const MOBILE_NAV = [
  { to: '/', label: 'Trang chủ', icon: 'home', end: true },
  { to: '/san-pham', label: 'Sản phẩm', icon: 'grid' },
  { to: '/dich-vu', label: 'Dịch vụ', icon: 'service' },
  { to: '/gio', label: 'Giỏ', icon: 'cart' },
  { to: '/tra-cuu', label: 'Tra cứu', icon: 'qr' },
];

export default function Layout({ children }) {
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [bump, setBump] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const fn = () => {
      setTick((t) => t + 1);
      setBump(true);
      setTimeout(() => setBump(false), 320);
    };
    window.addEventListener('bizops-cart', fn);
    return () => window.removeEventListener('bizops-cart', fn);
  }, []);

  // Header thu nho + doi bong khi cuon > 8px (chi doi transform/opacity cua lop nen)
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 8);
        raf = 0;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const count = cartCount();

  return (
    <>
      <a className="skip-link" href="#main">Bỏ qua tới nội dung</a>

      <div className="topbar">
        <div className="wrap">
          <span>Hotline: 1900-xxxx · Mở cửa 8h–22h · Giao nội thành 1–2 ngày</span>
          <span><Link to="/tra-cuu">Tra cứu đơn</Link> · <Link to="/ho-tro">Hỗ trợ</Link> · <Link to="/khuyen-mai">Khuyến mãi</Link></span>
        </div>
      </div>

      <OfflineBanner />

      <header className={'header' + (scrolled ? ' is-scrolled' : '')}>
        <div className="wrap">
          <Link className="logo" to="/" aria-label="BizOps Café — trang chủ">BizOps <span>Café</span></Link>

          <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); nav('/tim-kiem?q=' + encodeURIComponent(q.trim())); }}>
            <input
              aria-label="Tìm món"
              placeholder="Tìm cà phê, trà, bánh, combo… (gõ không dấu vẫn ra)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button className="ui-btn btn-primary" type="submit">
              <Icon name="search" size={18} />
              <span className="ui-btn-label">Tìm</span>
            </button>
          </form>

          <Link className="ui-btn btn-ghost cartbtn" to="/gio" aria-label={`Giỏ hàng ${count} món`}>
            <Icon name="cart" size={18} />
            <span className="ui-btn-label">Giỏ</span>
            {count > 0 ? <span className={'badge-cart' + (bump ? ' is-bump' : '')}>{count}</span> : null}
          </Link>
        </div>
      </header>

      <nav className="nav" aria-label="Danh mục chính">
        <div className="wrap">
          {TOP_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>
          ))}
        </div>
      </nav>

      <main className="wrap" id="main">{children}</main>

      <footer className="footer">
        <div className="wrap">
          <div>
            <h2 className="footer-h">BizOps Café</h2>
            <p>Cà phê, trà, bánh &amp; teabreak văn phòng.<br />Mở cửa 8h–22h mỗi ngày.</p>
            <p><small>Giá web do server quyết định theo giờ.</small></p>
          </div>
          <div>
            <h2 className="footer-h">Hỗ trợ KH</h2>
            <p><Link to="/tra-cuu">Tra cứu đơn (2 yếu tố)</Link><br /><Link to="/ho-tro">FAQ &amp; ticket</Link><br />Hotline 1900-xxxx<br />Chat góc phải màn hình</p>
          </div>
          <div>
            <h2 className="footer-h">Chính sách</h2>
            <p>Đổi trả 7 ngày (lỗi NSX)<br />Nội thành 1–2 ngày, liên tỉnh 2–4 ngày<br />VAT xuất trong 2 ngày<br />Tra cứu bảo mật 2 yếu tố</p>
          </div>
          <div>
            <h2 className="footer-h">Thanh toán</h2>
            <p>VietQR (tự gạch nợ) · COD · Ví điện tử<br /><small>Webhook HMAC + chống replay</small><br /><small>© BizOps Café v6.1</small></p>
          </div>
        </div>
      </footer>

      {/* Thanh dieu huong duoi (mobile) */}
      <nav className="mobile-nav" aria-label="Điều hướng nhanh">
        {MOBILE_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <span className="mnav-ico">
              <Icon name={n.icon} size={22} />
              {n.to === '/gio' && count > 0 ? <span className="badge-cart">{count}</span> : null}
            </span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
