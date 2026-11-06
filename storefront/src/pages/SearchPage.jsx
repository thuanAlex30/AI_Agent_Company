import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getProducts } from '../services/api.js';
import ProductCard from '../components/ProductCard.jsx';

export default function SearchPage({ toast }) {
  const [sp] = useSearchParams();
  const q = sp.get('q') || '';
  const [items, setItems] = useState(null);
  useEffect(() => {
    setItems(null);
    if (!q) { setItems([]); return; }
    getProducts('search=' + encodeURIComponent(q) + '&limit=20').then((d) => setItems(d.items)).catch(() => setItems([]));
  }, [q]);
  return (
    <>
      <h2>Kết quả “{q}”</h2>
      {!items && <div className="grid">{[1, 2].map((i) => <div key={i} className="card"><div className="skel"> </div></div>)}</div>}
      {items && items.length === 0 && <div className="alert">Không thấy. Thử “ca phe”, “tra dao”, “combo”. <Link to="/san-pham">Xem thực đơn</Link></div>}
      {items && items.length > 0 && <div className="grid">{items.map((p) => <ProductCard key={p.sku} p={p} toast={toast} />)}</div>}
    </>
  );
}
