import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Icon from './ui/Icon.jsx';
import { OfflineBanner } from './ui/States.jsx';

// Dieu huong chinh: landing BizOps AI + demo F&B tach rieng.
// Khong dua /san-pham, /gio, /thanh-toan vao nav chinh.
const TOP_NAV = [
  { to: '/', label: 'Tổng quan', end: true },
  { href: '/#tinh-nang', label: 'Tính năng' },
  { href: '/#quy-trinh', label: 'Quy trình' },
  { href: '/#ai-agent', label: 'AI Agent' },
  { to: '/demo-fb', label: 'Demo F&B' },
  { to: '/ho-tro', label: 'Hỗ trợ' },
];

const MOBILE_NAV = [
  { to: '/', label: 'Tổng quan', icon: 'home', end: true },
  { href: '/#tinh-nang', label: 'Tính năng', icon: 'grid' },
  { href: '/#ai-agent', label: 'AI Agent', icon: 'sparkle' },
  { to: '/demo-fb', label: 'Demo F&B', icon: 'service' },
  { to: '/ho-tro', label: 'Hỗ trợ', icon: 'chat' },
];

function NavItems({ mobile = false }) {
  const list = mobile ? MOBILE_NAV : TOP_NAV;
  return (
    <>
      {list.map((n) => {
        if (n.href) {
          return mobile ? (
            <a key={n.label} href={n.href}>
              <span className="mnav-ico"><Icon name={n.icon} size={22} /></span>
              <span>{n.label}</span>
            </a>
          ) : (
            <a key={n.label} href={n.href}>{n.label}</a>
          );
        }
        return (
          <NavLink key={n.to} to={n.to} end={n.end}>
            {mobile ? (
              <>
                <span className="mnav-ico"><Icon name={n.icon} size={22} /></span>
                <span>{n.label}</span>
              </>
            ) : (
              n.label
            )}
          </NavLink>
        );
      })}
    </>
  );
}

export default function Layout({ children }) {
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();
  const isDemo = loc.pathname === '/demo-fb' || ['/san-pham', '/gio', '/thanh-toan', '/xac-nhan', '/tra-cuu', '/tim-kiem', '/khuyen-mai', '/dich-vu'].some((p) => loc.pathname === p || loc.pathname.startsWith(p + '/'));

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

  // Scroll toi hash khi dieu huong tu trang khac (React Router khong tu scroll)
  useEffect(() => {
    if (loc.hash) {
      const el = document.querySelector(loc.hash);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else if (loc.pathname === '/') {
      // ve trang chu khong hash -> len dau (tru khi back/forward giu vi tri)
    }
  }, [loc]);

  return (
    <>
      <a className="skip-link" href="#main">Bỏ qua tới nội dung</a>

      <div className="topbar">
        <div className="wrap">
          <span>BizOps AI — ERP và AI Agent cho doanh nghiệp vừa và nhỏ</span>
          <span><Link to="/demo-fb">Demo F&B</Link> · <Link to="/ho-tro">Hỗ trợ</Link> · <a href="/#demo">Đăng ký demo</a></span>
        </div>
      </div>

      <OfflineBanner />

      <header className={'header' + (scrolled ? ' is-scrolled' : '')}>
        <div className="wrap">
          <Link className="logo" to="/" aria-label="BizOps AI — trang chủ">BizOps <span>AI</span></Link>
          <span style={{ color: 'var(--ink-400)', fontSize: 'var(--fs-xs)', flex: 1 }}>ERP + AI Agent · bản demo giới thiệu sản phẩm</span>
          <a className="ui-btn btn-primary" href="/#demo">Đăng ký demo</a>
        </div>
      </header>

      <nav className="nav" aria-label="Danh mục chính">
        <div className="wrap">
          <NavItems />
        </div>
      </nav>

      {isDemo ? (
        <div className="wrap" style={{ marginTop: 'var(--s-3)' }}>
          <div className="alert" role="note" style={{ margin: 0 }}>
            <Icon name="info" size={18} />
            <span><strong>Khu demo F&B</strong> — dữ liệu minh họa, không phải cửa hàng thật. <Link to="/" style={{ fontWeight: 700 }}>Về trang BizOps AI →</Link></span>
          </div>
        </div>
      ) : null}

      <main className="wrap" id="main">{children}</main>

      <footer className="footer">
        <div className="wrap">
          <div>
            <h2 className="footer-h">BizOps AI</h2>
            <p>ERP và AI Agent hỗ trợ doanh nghiệp quản lý vận hành trên một nền tảng.<br />Trang này là website giới thiệu sản phẩm (bản demo).</p>
          </div>
          <div>
            <h2 className="footer-h">Sản phẩm</h2>
            <p><a href="/#tinh-nang">Module đã triển khai</a><br /><a href="/#quy-trinh">Luồng mẫu</a><br /><a href="/#ai-agent">AI Agent</a><br /><a href="/#quan-tri">Quản trị &amp; phân quyền</a></p>
          </div>
          <div>
            <h2 className="footer-h">Demo</h2>
            <p><Link to="/demo-fb">Demo ngành F&B (dữ liệu minh họa)</Link><br /><Link to="/ho-tro">Hỗ trợ &amp; FAQ</Link><br /><a href="/#demo">Đăng ký demo</a></p>
          </div>
          <div>
            <h2 className="footer-h">Liên hệ</h2>
            <p>Website chưa có form nhận lead public.<br />Cấu hình <code>VITE_CONTACT_EMAIL</code> để bật nút gửi email.<br /><small>© BizOps AI — bản demo</small></p>
          </div>
        </div>
      </footer>

      <nav className="mobile-nav" aria-label="Điều hướng nhanh">
        <NavItems mobile />
      </nav>
    </>
  );
}
