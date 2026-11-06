import { Link } from 'react-router-dom';
import { fmtVND } from '../utils/format.js';
import { addToCart } from '../store/cart.js';

export default function ProductCard({ p, toast }) {
  const out = p.stock === 'out_of_stock';
  return (
    <div className="card">
      <div style={{ fontSize: 44 }}>{p.is_combo ? '🎁' : p.category === 'tra' ? '🍑' : p.category === 'banh' ? '🍰' : '☕'}</div>
      <h3><Link to={`/san-pham/${p.slug}`}>{p.name}</Link></h3>
      <div className="price">{fmtVND(p.price)}</div>
      <div style={{ margin: '6px 0', display: 'flex', gap: 6 }}>
        {p.badge && <span className="pill hot">{p.badge}</span>}
        <span className={out ? 'pill out' : 'pill ok'}>{out ? 'Hết hàng' : 'Còn hàng'}</span>
      </div>
      <button className="btn small" disabled={out} onClick={() => { addToCart(p.sku, 1); toast && toast(`Đã thêm ${p.name}`); }}>
        {out ? 'Hết hàng' : 'Thêm giỏ'}
      </button>
    </div>
  );
}
