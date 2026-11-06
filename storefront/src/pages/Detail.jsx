import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProduct } from '../services/api.js';
import { fmtVND } from '../utils/format.js';
import { addToCart } from '../store/cart.js';

export default function Detail({ toast }) {
  const { slug } = useParams();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [qty, setQty] = useState(1);
  useEffect(() => {
    setP(null); setErr('');
    getProduct(slug).then(setP).catch((e) => setErr(e.message));
  }, [slug]);
  if (err) return <div className="alert">Không thấy món. <Link to="/san-pham">Về thực đơn</Link></div>;
  if (!p) return <div className="card"><div className="skel">Đang tải…</div></div>;
  const out = p.stock === 'out_of_stock';
  return (
    <>
      <p><Link to="/">Cửa hàng</Link> / <Link to="/san-pham">Thực đơn</Link> / {p.name}</p>
      <div className="card">
        <div style={{ fontSize: 72 }}>{p.is_combo ? '🎁' : '☕'}</div>
        <h2>{p.name}</h2>
        <div className="price">{fmtVND(p.price)}</div>
        <p>{p.description || ''}</p>
        <p><span className={out ? 'pill out' : 'pill ok'}>{out ? 'Hết hàng' : 'Còn hàng'}</span> {p.badge && <span className="pill hot">{p.badge}</span>}</p>
        {p.combo_items && (
          <div className="alert">🎁 Combo gồm: {p.combo_items.map((c) => `${c.child_sku} x${c.qty}`).join(' + ')} (trừ kho theo thành phần)</div>
        )}
        <div className="row">
          <input type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} style={{ maxWidth: 100 }} aria-label="Số lượng" />
          <button className="btn" disabled={out} onClick={() => { addToCart(p.sku, qty); toast && toast(`Đã thêm ${qty} x ${p.name}`); }}>{out ? 'Hết hàng' : 'Thêm giỏ'}</button>
          <Link className="btn ghost" to="/gio">Xem giỏ</Link>
        </div>
      </div>
    </>
  );
}
