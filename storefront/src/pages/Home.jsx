import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts, getBanners, getPromos, getServices } from '../services/api.js';
import { fmtVND, flashLeft } from '../utils/format.js';
import ProductCard from '../components/ProductCard.jsx';

export default function Home({ toast }) {
  const [products, setProducts] = useState(null);
  const [banners, setBanners] = useState([]);
  const [promos, setPromos] = useState([]);
  const [services, setServices] = useState([]);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(flashLeft());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [pr, ba, pm, sv] = await Promise.all([
          getProducts('limit=4'),
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
    const t = setInterval(() => setLeft(flashLeft()), 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const combo = (products || []).find((p) => p.sku === 'COMBO-SANG');

  return (
    <>
      <div className="hero">
        <div>
          <h1>BizOps Café — sáng năng lượng</h1>
          <p>{banners[0]?.title || 'Combo sáng siêu tiết kiệm'} · Giao 1-2 ngày nội thành · HĐ VAT 2 ngày</p>
          <div className="cta">
            <Link className="btn" to="/san-pham">Đặt món</Link>
            <Link className="btn ghost" to="/dich-vu" style={{ background: '#fff' }}>Đặt teabreak</Link>
          </div>
        </div>
        <div className="imgbox">☕🍰</div>
      </div>

      <div className="quick">
        <Link to="/san-pham">🍽️ Đặt món</Link>
        <Link to="/dich-vu">🎉 Đặt teabreak</Link>
        <Link to="/tra-cuu">🔎 Tra cứu đơn</Link>
        <Link to="/khuyen-mai">🏷️ Khuyến mãi</Link>
      </div>

      {combo && (
        <div className="flash">
          <div><strong>⚡ Flash-sale: {combo.name}</strong><div className="price">{fmtVND(combo.price)}</div></div>
          <div className="timer" aria-label="Đếm ngược">{left}</div>
          <Link className="btn" to={`/san-pham/${combo.slug}`}>Mua ngay</Link>
        </div>
      )}

      <h2>Món nổi bật</h2>
      {err && <div className="alert">Lỗi tải món: {err} <button className="btn small" onClick={() => location.reload()}>Thử lại</button></div>}
      {!products && !err && <div className="grid">{[1, 2, 3, 4].map((i) => <div key={i} className="card"><div className="skel"> </div></div>)}</div>}
      {products && products.length === 0 && <div className="alert">Chưa có món. Quay lại sau nhé.</div>}
      {products && products.length > 0 && (
        <div className="grid">{products.map((p) => <ProductCard key={p.sku} p={p} toast={toast} />)}</div>
      )}

      <h2>Dịch vụ</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {(services || []).slice(0, 3).map((s) => (
          <div className="card" key={s.code || s.id}>
            <h3>{s.name}</h3>
            <p style={{ color: '#6b7280' }}>{s.description || ''}</p>
            <Link className="btn small ghost" to="/dich-vu">Đặt lịch</Link>
          </div>
        ))}
      </div>

      {promos.length > 0 && (
        <><h2>Ưu đãi</h2>
          <div className="grid">{promos.map((m) => <div className="card" key={m.code}><span className="pill sale">{m.code}</span><h3>{m.title}</h3><p>{m.description}</p></div>)}</div>
        </>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <strong>Vì sao chọn BizOps Café?</strong>
        <p>Giao nội thành 1-2 ngày, liên tỉnh 2-4 ngày · Đổi trả 7 ngày khi lỗi NSX · CSKH + QA 24h · Giá web do server quyết định theo giờ.</p>
      </div>
    </>
  );
}
