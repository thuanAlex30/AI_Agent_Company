import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts, getBanners, getPromos, getServices } from '../services/api.js';
import { fmtVND } from '../utils/format.js';
import ProductCard from '../components/ProductCard.jsx';
import Countdown from '../components/ui/Countdown.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';
import useReveal from '../hooks/useReveal.js';

function Reveal({ children, className = '' }) {
  const ref = useReveal();
  return <div ref={ref} className={'reveal ' + className}>{children}</div>;
}

export default function Home({ toast }) {
  const [products, setProducts] = useState(null);
  const [banners, setBanners] = useState([]);
  const [promos, setPromos] = useState([]);
  const [services, setServices] = useState([]);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  usePageMeta(
    'Đặt món & Teabreak văn phòng',
    'BizOps Café — cà phê, trà, bánh & teabreak văn phòng. Giao nội thành 1–2 ngày, đổi trả 7 ngày, tra cứu đơn 2 yếu tố.'
  );

  useEffect(() => {
    let alive = true;
    setErr('');
    (async () => {
      try {
        const [pr, ba, pm, sv] = await Promise.all([
          getProducts('limit=8'),
          getBanners().catch(() => []),
          getPromos().catch(() => []),
          getServices().catch(() => []),
        ]);
        if (!alive) return;
        setProducts(pr.items || []);
        setBanners(ba || []);
        setPromos(pm || []);
        setServices(Array.isArray(sv) ? sv : (sv.items || []));
      } catch (e) { if (alive) setErr(e.message); }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const combo = (products || []).find((p) => p.sku === 'COMBO-SANG');
  const best = (products || []).filter((p) => p.sku !== 'COMBO-SANG').slice(0, 4);

  return (
    <>
      <section className="hero">
        <div>
          <Badge tone="sale">Mở cửa 8h–22h · giao nội thành 1–2 ngày</Badge>
          <h1>BizOps Café — sáng năng lượng</h1>
          <p>{banners[0]?.title || 'Combo sáng siêu tiết kiệm'} · HĐ VAT 2 ngày · đổi trả 7 ngày khi lỗi NSX</p>
          <div className="cta">
            <Link className="ui-btn btn-primary ui-btn-lg" to="/san-pham">Đặt món</Link>
            <Link className="ui-btn btn-ghost ui-btn-lg" to="/dich-vu" style={{ background: '#fff' }}>Đặt teabreak</Link>
            <Link className="ui-btn btn-ghost ui-btn-lg" to="/tra-cuu" style={{ background: '#fff' }}>Tra cứu đơn</Link>
          </div>
        </div>
        <div className="imgbox" aria-hidden="true" />
      </section>

      {banners.length > 1 ? (
        /* Ban trang tri: dung <nav> + <a>. Khong dung role="list"/"listitem" tren
           <a> — axe-core bao loi "aria-allowed-role" (link khong duoc phép mang
           role listitem). */
        <nav className="banners" aria-label="Khuyến mãi nổi bật">
          {banners.slice(1, 4).map((b) => (
            <Link key={b.slug || b.title} className="banner" to={b.link || '/khuyen-mai'}>
              {b.title}
            </Link>
          ))}
        </nav>
      ) : null}

      <nav className="quick" aria-label="Danh mục nhanh">
        <Link to="/san-pham"><Icon name="grid" size={22} /><span>Đặt món</span></Link>
        <Link to="/dich-vu"><Icon name="gift" size={22} /><span>Đặt teabreak</span></Link>
        <Link to="/tra-cuu"><Icon name="search" size={22} /><span>Tra cứu đơn</span></Link>
        <Link to="/khuyen-mai"><Icon name="tag" size={22} /><span>Khuyến mãi</span></Link>
      </nav>

      {combo ? (
        <Reveal className="flash">
          <div>
            <strong>Flash-sale: {combo.name}</strong>
            <div className="price">{fmtVND(combo.price)}</div>
            <small style={{ color: 'var(--ink-400)' }}>Giá theo giờ — server quyết định lúc checkout</small>
          </div>
          <Countdown until={new Date(new Date().setHours(9, 0, 0, 0)).getTime() > Date.now()
            ? new Date(new Date().setHours(9, 0, 0, 0)).getTime()
            : new Date(new Date().setDate(new Date().getDate() + 1)).setHours(9, 0, 0, 0)} />
          <Link className="ui-btn btn-primary" to={`/san-pham/${combo.slug}`}>Mua ngay</Link>
        </Reveal>
      ) : null}

      <div className="sechd">
        <h2>Món nổi bật</h2>
        <Link className="ui-btn btn-ghost ui-btn-sm" to="/san-pham">Xem tất cả →</Link>
      </div>

      {err ? (
        <ErrorState
          title="Không tải được danh sách món"
          description={err}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : null}

      {!products && !err ? (
        <div className="grid">{[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}</div>
      ) : null}

      {products && products.length === 0 ? (
        <div className="alert">Chưa có món. Quay lại sau nhé.</div>
      ) : null}

      {products && products.length > 0 ? (
        <Reveal>
          <div className="grid">{best.map((p) => <ProductCard key={p.sku} p={p} toast={toast} />)}</div>
        </Reveal>
      ) : null}

      <div className="sechd">
        <h2>Dịch vụ teabreak văn phòng</h2>
        <Link className="ui-btn btn-ghost ui-btn-sm" to="/dich-vu">Báo giá →</Link>
      </div>
      <div className="grid g3">
        {services.length > 0 ? services.slice(0, 3).map((s) => (
          <article className="card" key={s.code || s.id}>
            <h3>{s.name}</h3>
            <p style={{ color: 'var(--ink-400)' }}>{s.description || ''}</p>
            <div className="row">
              <Badge tone="brand">{s.code}</Badge>
              <Link className="ui-btn btn-ghost ui-btn-sm" to="/dich-vu">Đặt lịch</Link>
            </div>
          </article>
        )) : (
          <div className="card">Teabreak 30–1000 người · xuất VAT · setup tận nơi. <Link to="/dich-vu">Đặt lịch →</Link></div>
        )}
      </div>

      {promos.length > 0 ? (
        <>
          <div className="sechd">
            <h2>Ưu đãi</h2>
            <Link className="ui-btn btn-ghost ui-btn-sm" to="/khuyen-mai">Tất cả →</Link>
          </div>
          <div className="grid">
            {promos.slice(0, 4).map((m) => (
              <article className="card" key={m.code}>
                <Badge tone="sale">{m.code}</Badge>
                <h3>{m.title}</h3>
                <p>{m.description}</p>
                <p style={{ color: 'var(--ink-400)', fontSize: 'var(--fs-xs)' }}>{m.start_date || ''} → {m.end_date || ''}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}

      <Reveal className="card trust" style={{ marginTop: 'var(--s-5)' }}>
        <strong>Vì sao chọn BizOps Café?</strong>
        <div className="trustgrid">
          <div><Icon name="truck" size={18} /> Giao nội thành 1–2 ngày, liên tỉnh 2–4 ngày</div>
          <div><Icon name="refresh" size={18} /> Đổi trả 7 ngày khi lỗi NSX (QA 24h)</div>
          <div><Icon name="chat" size={18} /> CSKH + chat 8h–22h</div>
          <div><Icon name="receipt" size={18} /> Giá web theo giờ · VAT 2 ngày</div>
        </div>
      </Reveal>
    </>
  );
}
