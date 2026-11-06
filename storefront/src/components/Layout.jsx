import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { cartCount } from '../store/cart.js';

export default function Layout({ children }) {
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    window.addEventListener('bizops-cart', fn);
    return () => window.removeEventListener('bizops-cart', fn);
  }, []);
  return (
    <>
      <div className="topbar">
        <div className="wrap">
          <span>Hotline: 1900-xxxx | Mở cửa 8h-22h</span>
          <span><Link to="/tra-cuu">Tra cứu đơn</Link> · <Link to="/ho-tro">Hỗ trợ</Link></span>
        </div>
      </div>
      <header className="header">
        <div className="wrap">
          <Link className="logo" to="/">BizOps <span>Café</span></Link>
          <form className="search" onSubmit={(e) => { e.preventDefault(); nav('/tim-kiem?q=' + encodeURIComponent(q)); }}>
            <input aria-label="Tìm món" placeholder="Tìm cà phê, trà, bánh, combo..." value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn" type="submit">Tìm</button>
          </form>
          <Link className="btn ghost" to="/gio">Giỏ <span className="badge-cart">{cartCount()}</span></Link>
        </div>
      </header>
      <nav className="nav" aria-label="Danh mục">
        <div className="wrap">
          <NavLink to="/" end>Cửa hàng</NavLink>
          <NavLink to="/san-pham">Thực đơn</NavLink>
          <NavLink to="/dich-vu">Dịch vụ</NavLink>
          <NavLink to="/khuyen-mai">Khuyến mãi</NavLink>
          <NavLink to="/tra-cuu">Tra cứu</NavLink>
          <NavLink to="/ho-tro">Hỗ trợ</NavLink>
        </div>
      </nav>
      <main className="wrap">{children}</main>
      <footer className="footer">
        <div className="wrap">
          <div><h4>Về chúng tôi</h4><p>BizOps Café — cà phê, trà, bánh & teabreak văn phòng.</p></div>
          <div><h4>Hỗ trợ KH</h4><p><Link to="/tra-cuu">Tra cứu đơn</Link><br /><Link to="/ho-tro">FAQ & ticket</Link><br />Hotline 1900-xxxx</p></div>
          <div><h4>Chính sách</h4><p>Đổi trả 7 ngày · Ship nội thành 1-2 ngày, liên tỉnh 2-4 ngày · Bảo mật 2 yếu tố</p></div>
          <div><h4>Liên hệ</h4><p>8h-22h mỗi ngày<br />COD · VietQR · Ví điện tử<br /><small>© BizOps Café v6.1</small></p></div>
        </div>
      </footer>
    </>
  );
}
