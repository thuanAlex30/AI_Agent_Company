import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getProduct } from '../services/api.js';
import { fmtVND } from '../utils/format.js';
import { addToCart } from '../store/cart.js';
import QuantityInput from '../components/ui/QuantityInput.jsx';
import PriceTag from '../components/ui/PriceTag.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';
import useStickyCta from '../hooks/useStickyCta.js';

// SPEC §7.1: emoji trang tri phai la CSS pseudo-element (khong phai text node)
// de KHONG tro thanh ung vien LCP — xem ghi chu o components/ProductCard.jsx.
const ART = { combo: 'combo', tra: 'tra', banh: 'banh', cafe: 'cafe' };

export default function Detail({ toast }) {
  const { slug } = useParams();
  const [p, setP] = useState(null);
  const [err, setErr] = useState('');
  const [qty, setQty] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  // Trang co sticky CTA (mobile) -> danh dau <html> de CSS day noi + nang FAB len
  // tranh CHONG CHAP nut chat voi CTA (WCAG 2.2 target-size).
  useStickyCta(true);

  usePageMeta(p ? p.name : 'Chi tiết món', p ? (p.description || '').slice(0, 160) : '');

  useEffect(() => {
    setP(null); setErr(''); setQty(1);
    getProduct(slug).then(setP).catch((e) => setErr(e.message));
  }, [slug, reloadKey]);

  if (err) {
    return (
      <ErrorState
        heading="Chi tiết sản phẩm"
        title="Không thấy món này"
        description="Món có thể đã hết hoặc đường dẫn không đúng."
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    );
  }
  if (!p) {
    return (
      <div className="card detail">
        <Skeleton h={200} r={16} />
        <div>
          <Skeleton h={28} w="60%" />
          <Skeleton h={20} w="35%" style={{ marginTop: 12 }} />
          <Skeleton h={80} style={{ marginTop: 12 }} />
        </div>
      </div>
    );
  }

  const out = p.stock === 'out_of_stock';
  const art = ART[p.is_combo ? 'combo' : p.category] || ART.cafe;

  return (
    <>
      <p className="crumb"><Link to="/">Cửa hàng</Link> / <Link to="/san-pham">Thực đơn</Link> / {p.name}</p>

      <div className="card detail">
        <div className={'dimg art-' + art} aria-hidden="true" />
        <div>
          <h1 className="page-h1" style={{ margin: '0 0 var(--s-1)', fontSize: 'var(--fs-xl)' }}>{p.name}</h1>
          <PriceTag price={p.price} originalPrice={p.original_price} size="lg" />
          <p><small style={{ color: 'var(--ink-400)' }}>
            Giá web theo giờ (server quyết định lúc checkout){p.price_rule ? ` · rule #${p.price_rule}` : ''}
          </small></p>
          <p>{p.description || ''}</p>

          <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge tone={out ? 'neutral' : 'ok'}>{out ? 'Hết hàng' : 'Còn hàng'}</Badge>
            {p.badge ? <Badge tone="err">{p.badge}</Badge> : null}
            {p.unit ? <Badge tone="neutral">/{p.unit}</Badge> : null}
          </p>

          {p.combo_items && p.combo_items.length > 0 ? (
            <div className="alert">
              Combo gồm: {p.combo_items.map((c) => `${c.child_sku} x${c.qty}`).join(' + ')}
              {' '}(trừ kho theo thành phần — hết 1 món là hết combo)
            </div>
          ) : null}

          <div className="row">
            <QuantityInput value={qty} onChange={setQty} min={1} max={100} disabled={out} />
            <Button
              disabled={out}
              icon="cart"
              onClick={() => {
                addToCart(p.sku, qty);
                toast && toast(`Đã thêm ${qty} x ${p.name}`);
              }}
            >
              {out ? 'Hết hàng' : 'Thêm giỏ'}
            </Button>
            <Link className="ui-btn btn-ghost" to="/gio">Xem giỏ</Link>
          </div>

          <p style={{ color: 'var(--ink-400)', fontSize: 'var(--fs-xs)', marginTop: 'var(--s-3)' }}>
            Giao nội thành 1–2 ngày · đổi trả 7 ngày khi lỗi NSX · giữ mã DHW để tra cứu.
          </p>
        </div>
      </div>

      {/* Nut "Them vao gio" dinh day man hinh tren mobile */}
      <div className="sticky-cta">
        <div className="sticky-cta-inner">
          <div className="sticky-cta-price"><strong>{fmtVND(p.price)}</strong></div>
          <Button
            full
            disabled={out}
            icon="cart"
            onClick={() => {
              addToCart(p.sku, qty);
              toast && toast(`Đã thêm ${qty} x ${p.name}`);
            }}
          >
            {out ? 'Hết hàng' : 'Thêm vào giỏ'}
          </Button>
        </div>
      </div>
    </>
  );
}
