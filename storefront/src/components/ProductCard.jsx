import { memo } from 'react';
import { Link } from 'react-router-dom';
import { addToCart } from '../store/cart.js';
import highlight from '../utils/highlight.js';
import PriceTag from './ui/PriceTag.jsx';
import Badge from './ui/Badge.jsx';
import Button from './ui/Button.jsx';

// Emoji chi con lam HINH ANH trang tri (khong phai icon chuc nang)
// components/ProductCard.jsx
//
// SPEC §7.1: anh trang tri (emoji) KHONG duoc la ung vien LCP.
// Chrome tinh LCP tren TEXT NODE trong DOM; emoji trong `<div>{art}</div>` la
// text node -> 332x332 px -> tro thanh LCP va ghi LCP lai o thoi diem muộn.
// Giai phap: chuyen sang CSS `::after` + `content` (pseudo-element KHONG phai
// text node -> khong duoc tinh vao LCP), giu nguyen hien thi.
const ART = {
  combo: 'combo',
  tra: 'tra',
  banh: 'banh',
  cafe: 'cafe',
};

function ProductCard({ p, toast, highlight: query }) {
  const out = p.stock === 'out_of_stock';
  const art = ART[p.is_combo ? 'combo' : p.category] || ART.cafe;

  return (
    <article className="card pcard">
      <div className={'pimg art-' + art} aria-hidden="true" />
      <div className="pbody">
        {/* heading-order (WCAG): trang co <h1> thi tieu de the san pham phai la <h2>,
            khong phai <h3> (nhay cap khong theo thu tu). dung <h2> + CSS de giong hien thi. */}
        <h2 className="pcard-h"><Link to={`/san-pham/${p.slug}`}>{highlight(p.name, query)}</Link></h2>
        <PriceTag price={p.price} originalPrice={p.original_price} />
        <div style={{ margin: 'var(--s-2) 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.badge ? <Badge tone="err">{p.badge}</Badge> : null}
          {p.is_combo ? <Badge tone="sale">Combo</Badge> : null}
          <Badge tone={out ? 'neutral' : 'ok'}>{out ? 'Hết hàng' : 'Còn hàng'}</Badge>
        </div>
        <div className="row" style={{ marginTop: 'auto' }}>
          <Button
            size="sm"
            disabled={out}
            icon="cart"
            onClick={() => {
              addToCart(p.sku, 1);
              toast && toast(`Đã thêm ${p.name}`);
            }}
          >
            {out ? 'Hết hàng' : 'Thêm giỏ'}
          </Button>
          <Link className="ui-btn btn-ghost ui-btn-sm" to={`/san-pham/${p.slug}`}>Chi tiết</Link>
        </div>
      </div>
    </article>
  );
}

// React.memo: danh sach san pham lau khong can render lai khi parent doi
export default memo(ProductCard);
