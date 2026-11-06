import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getProducts } from '../services/api.js';
import { norm } from '../utils/format.js';
import ProductCard from '../components/ProductCard.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

const LIMIT = 12;

const CATEGORIES = [
  { value: '', label: 'Tất cả' },
  { value: 'cafe', label: 'Cà phê' },
  { value: 'tra', label: 'Trà' },
  { value: 'banh', label: 'Bánh' },
  { value: 'combo', label: 'Combo' },
];

const SORTS = [
  { value: 'sort', label: 'Nổi bật' },
  { value: 'price_asc', label: 'Giá tăng' },
  { value: 'price_desc', label: 'Giá giảm' },
  { value: 'new', label: 'Mới nhất' },
];

export default function Catalog({ toast }) {
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState({ total: 0 });
  const [err, setErr] = useState('');
  const [q, setQ] = useState(sp.get('search') || '');
  const [reloadKey, setReloadKey] = useState(0);
  const timer = useRef(null);

  const category = sp.get('category') || '';
  const sort = sp.get('sort') || 'sort';
  const search = sp.get('search') || '';
  const page = Math.max(1, Number(sp.get('page') || 1));

  usePageMeta('Thực đơn', 'Cà phê, trà, bánh và combo tại BizOps Café — giao nội thành 1–2 ngày.');

  function set(k, v) {
    const n = new URLSearchParams(sp);
    if (!v) n.delete(k); else n.set(k, v);
    if (k !== 'page') n.delete('page');
    setSp(n, { replace: k === 'search' });
  }

  // debounce 300ms — gõ không dấu vẫn ra (server norm)
  function onQ(v) {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => set('search', v.trim()), 300);
  }

  useEffect(() => { setQ(sp.get('search') || ''); }, [sp]);

  useEffect(() => {
    let alive = true;
    setItems(null); setErr('');
    const query = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
      ...(category ? { category } : {}),
      ...(sort ? { sort } : {}),
      ...(search ? { search } : {}),
    }).toString();
    getProducts(query)
      .then((d) => { if (alive) { setItems(d.items); setMeta(d.meta || { total: 0 }); } })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [category, sort, search, page, reloadKey]);

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / LIMIT));
  const hasFilter = search || category || sort !== 'sort';

  return (
    <>
      <p className="crumb"><a href="/">Cửa hàng</a> / Thực đơn</p>

      <div className="sechd">
        <h1 className="page-h1">Thực đơn</h1>
        <span style={{ color: 'var(--ink-400)' }}>{meta.total || 0} món</span>
      </div>

      {/* Chip loc cuon ngang tren mobile */}
      <div className="chip-row" role="group" aria-label="Lọc theo danh mục">
        {CATEGORIES.map((c) => (
          <button
            key={c.value || 'all'}
            type="button"
            className={'chip' + (category === c.value ? ' is-active' : '')}
            aria-pressed={category === c.value}
            onClick={() => set('category', c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="catalog-layout">
        {/* Bo loc ben trai tren desktop */}
        <aside className="catalog-filters" aria-label="Bộ lọc">
          <div className="card">
            {/* heading-order (WCAG): h1 -> h2. Dung <h2> + class .ck-h de giong hien thi. */}
            <h2 className="ck-h" style={{ marginTop: 0 }}>Tìm món</h2>
            <input
              aria-label="Tìm món"
              placeholder="Tìm không dấu: ca phe…"
              value={q}
              onChange={(e) => onQ(e.target.value)}
            />

            <h2 className="ck-h">Danh mục</h2>
            <div className="chip-row" style={{ flexWrap: 'wrap' }}>
              {CATEGORIES.map((c) => (
                <button
                  key={c.value || 'all'}
                  type="button"
                  className={'chip' + (category === c.value ? ' is-active' : '')}
                  aria-pressed={category === c.value}
                  onClick={() => set('category', c.value)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <h2 className="ck-h">Sắp xếp</h2>
            <div className="chip-row" style={{ flexWrap: 'wrap' }}>
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={'chip' + (sort === s.value ? ' is-active' : '')}
                  aria-pressed={sort === s.value}
                  onClick={() => set('sort', s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {hasFilter ? (
              <Button variant="ghost" size="sm" icon="close" onClick={() => { setQ(''); setSp({}); }}>
                Xóa lọc
              </Button>
            ) : null}
          </div>
        </aside>

        <div>
          {err ? (
            <div className="alert" role="alert">
              <Icon name="alert" size={18} /> Lỗi: {err}
              <Button size="sm" variant="subtle" icon="refresh" onClick={() => setReloadKey((k) => k + 1)}>Thử lại</Button>
            </div>
          ) : null}

          {!items && !err ? (
            <div className="grid">{[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}</div>
          ) : null}

          {items && items.length === 0 ? (
            <EmptyState
              icon="search"
              title={`Không thấy món “${search}”`}
              description={`Thử “${norm(search) || 'ca phe'}” hoặc xem tất cả món.`}
              action={<Button variant="ghost" icon="refresh" onClick={() => { setQ(''); setSp({}); }}>Xem tất cả</Button>}
            />
          ) : null}

          {items && items.length > 0 ? (
            <div className="grid">{items.map((p) => <ProductCard key={p.sku} p={p} toast={toast} />)}</div>
          ) : null}

          <div className="pager">
            <span>Trang {page}/{totalPages} · tổng {meta.total} món</span>
            <div className="row">
              {page > 1 ? <Button size="sm" variant="ghost" icon="chevronLeft" onClick={() => set('page', page - 1)}>Trước</Button> : null}
              {page < totalPages ? <Button size="sm" variant="ghost" iconRight="chevronRight" onClick={() => set('page', page + 1)}>Sau</Button> : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
