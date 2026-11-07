import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getProducts } from '../services/api.js';
import ProductCard from '../components/ProductCard.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

const GROUPS = [
  { label: 'Cà phê', go: '/san-pham?category=cafe' },
  { label: 'Trà đào', go: '/san-pham?category=tra' },
  { label: 'Bánh', go: '/san-pham?category=banh' },
  { label: 'Combo', go: '/san-pham?category=combo' },
];

/** To dam tu khoa duoc xu ly trong ProductCard (utils/highlight.js) */

export default function SearchPage({ toast }) {
  const [sp] = useSearchParams();
  const q = (sp.get('q') || '').trim();
  const [items, setItems] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const abortRef = useRef(null);

  usePageMeta(q ? `Tìm kiếm: ${q}` : 'Tìm kiếm (demo F&B)', 'Tìm món mẫu trong khu demo F&B — dữ liệu minh họa.');

  useEffect(() => {
    setItems(null);
    if (!q) { setItems([]); return; }
    let alive = true;
    // Huy request cu khi doi tu khoa
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    getProducts('search=' + encodeURIComponent(q) + '&limit=20')
      .then((d) => { if (alive) setItems(d.items || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; ctrl.abort(); };
  }, [q, reloadKey]);

  return (
    <>
      <p className="crumb"><Link to="/">BizOps AI</Link> / <Link to="/demo-fb">Demo F&B</Link> / Tìm kiếm</p>

      <div className="sechd">
        <h1 className="page-h1">Kết quả “{q || '…'}”</h1>
        {items && items.length > 0 ? (
          <span style={{ color: 'var(--ink-400)' }}>{items.length} món</span>
        ) : null}
      </div>

      {!q ? (
        <EmptyState
          icon="search"
          title="Nhập từ khóa để tìm"
          description="Gõ không dấu vẫn ra (ví dụ: “ca phe”). Bạn cũng có thể chọn nhanh bên dưới."
          action={
            <div className="row">
              {GROUPS.map((g) => (
                <Link key={g.label} className="ui-btn btn-ghost ui-btn-sm" to={g.go}>{g.label}</Link>
              ))}
            </div>
          }
        />
      ) : null}

      {!items && !!q ? (
        <div className="grid">{[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}</div>
      ) : null}

      {items && items.length === 0 && !!q ? (
        <EmptyState
          icon="search"
          title={`Không thấy “${q}”`}
          description="Thử “ca phe”, “tra dao”, “combo” — hoặc chọn nhanh:"
          action={
            <div className="row">
              {GROUPS.map((g) => (
                <Link key={g.label} className="ui-btn btn-ghost ui-btn-sm" to={g.go}>{g.label}</Link>
              ))}
              <Button size="sm" variant="subtle" icon="refresh" onClick={() => setReloadKey((k) => k + 1)}>Thử lại</Button>
            </div>
          }
        />
      ) : null}

      {items && items.length > 0 ? (
        <div className="grid">
          {items.map((p) => <ProductCard key={p.sku} p={p} toast={toast} highlight={q} />)}
        </div>
      ) : null}
    </>
  );
}
