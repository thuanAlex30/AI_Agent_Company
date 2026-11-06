import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getProducts } from '../services/api.js';
import { norm } from '../utils/format.js';
import ProductCard from '../components/ProductCard.jsx';

export default function Catalog({ toast }) {
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState({ total: 0 });
  const [err, setErr] = useState('');
  const category = sp.get('category') || '';
  const sort = sp.get('sort') || 'sort';
  const search = sp.get('search') || '';
  const page = Number(sp.get('page') || 1);

  function set(k, v) {
    const n = new URLSearchParams(sp);
    if (!v) n.delete(k); else n.set(k, v);
    if (k !== 'page') n.delete('page');
    setSp(n);
  }

  useEffect(() => {
    let alive = true;
    setItems(null); setErr('');
    const q = new URLSearchParams({ page, limit: 12, ...(category ? { category } : {}), ...(sort ? { sort } : {}), ...(search ? { search } : {}) }).toString();
    getProducts(q).then((d) => { if (alive) { setItems(d.items); setMeta(d.meta); } })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [category, sort, search, page]);

  return (
    <>
      <h2>Thực đơn</h2>
      <div className="toolbar">
        <input aria-label="Tìm món" placeholder="Tìm không dấu: ca phe…" defaultValue={search} onChange={(e) => set('search', e.target.value)} style={{ maxWidth: 220 }} />
        <select aria-label="Loại" value={category} onChange={(e) => set('category', e.target.value)}>
          <option value="">Tất cả loại</option>
          <option value="cafe">Cà phê</option>
          <option value="tra">Trà</option>
          <option value="banh">Bánh</option>
          <option value="combo">Combo</option>
        </select>
        <select aria-label="Sắp xếp" value={sort} onChange={(e) => set('sort', e.target.value)}>
          <option value="sort">Nổi bật</option>
          <option value="price_asc">Giá tăng</option>
          <option value="price_desc">Giá giảm</option>
        </select>
      </div>
      {err && <div className="alert">Lỗi: {err} <button className="btn small" onClick={() => location.reload()}>Thử lại</button></div>}
      {!items && !err && <div className="grid">{[1, 2, 3, 4].map((i) => <div key={i} className="card"><div className="skel"> </div></div>)}</div>}
      {items && items.length === 0 && <div className="alert">Không thấy món “{search}”. Thử “{norm(search) || 'ca phe'}” hoặc xem món bán chạy nhé.</div>}
      {items && items.length > 0 && <div className="grid">{items.map((p) => <ProductCard key={p.sku} p={p} toast={toast} />)}</div>}
      <p style={{ color: '#6b7280' }}>Tổng {meta.total} món · trang {page}</p>
      <div className="row">
        {page > 1 && <button className="btn small ghost" onClick={() => set('page', page - 1)}>← Trước</button>}
        {items && items.length === 12 && <button className="btn small ghost" onClick={() => set('page', page + 1)}>Sau →</button>}
      </div>
    </>
  );
}
