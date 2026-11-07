import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProductsBySkus } from '../services/api.js';
import { fmtVND } from '../utils/format.js';
import { getCart, setQty, clearCart } from '../store/cart.js';
import QuantityInput from '../components/ui/QuantityInput.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Badge from '../components/ui/Badge.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

export default function Cart({ toast }) {
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);

  usePageMeta('Giỏ hàng (demo F&B)', 'Giỏ hàng mẫu trong khu demo F&B — dữ liệu minh họa.');

  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    window.addEventListener('bizops-cart', fn);
    return () => window.removeEventListener('bizops-cart', fn);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const cart = getCart();
      if (!cart.length) { if (alive) setRows([]); return; }
      try {
        const map = await getProductsBySkus(cart.map((i) => i.sku));
        let sum = 0;
        const out = cart.map((it) => {
          const p = map.get(it.sku);
          if (!p) return { ...it, name: it.sku, price: 0, stock: 'out_of_stock', missing: true };
          sum += Number(p.price) * Number(it.qty);
          return { ...it, name: p.name, price: p.price, stock: p.stock, slug: p.slug, is_combo: p.is_combo, category: p.category };
        });
        if (alive) { setRows(out); setTotal(sum); }
      } catch {
        if (alive) setRows(cart.map((it) => ({ ...it, name: it.sku, price: 0, stock: 'out_of_stock' })));
      }
    })();
    return () => { alive = false; };
  }, [tick]);

  // Xoa co hoan tac (toast "Hoan tac" 5 giay)
  function removeRow(r) {
    const before = getCart();
    setQty(r.sku, 0);
    if (toast) {
      toast.push
        ? toast.push(`Đã xóa ${r.name}`, {
          tone: 'info',
          duration: 5000,
          action: {
            label: 'Hoàn tác',
            onClick: () => { before.forEach((i) => setQty(i.sku, i.qty)); },
          },
        })
        : toast(`Đã xóa ${r.name}`);
    }
  }

  if (rows === null) {
    return (
      <div className="card">
        <Skeleton h={24} w="40%" />
        <Skeleton h={56} style={{ marginTop: 12 }} />
        <Skeleton h={56} style={{ marginTop: 8 }} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon="cart"
        heading="Giỏ hàng"
        title="Giỏ trống"
        description="Chưa có món nào. Combo sáng đang flash-sale — xem ngay nhé."
        action={<Link className="ui-btn btn-primary" to="/san-pham">Xem thực đơn</Link>}
      />
    );
  }

  const hasOut = rows.some((r) => r.stock === 'out_of_stock');
  const count = rows.reduce((s, r) => s + Number(r.qty), 0);

  return (
    <>
      <p className="crumb"><Link to="/">BizOps AI</Link> / <Link to="/demo-fb">Demo F&B</Link> / Giỏ hàng</p>
      <div className="sechd">
        <h1 className="page-h1">Giỏ hàng</h1>
        <span style={{ color: 'var(--ink-400)' }}>{count} món</span>
      </div>

      {hasOut ? (
        <div className="alert" role="alert">
          <Icon name="alert" size={18} /> Có món vừa hết hàng — xóa khỏi giỏ trước khi thanh toán nhé.
        </div>
      ) : null}

      <div className="cart-list">
        {rows.map((r) => (
          <div className="cart-row" key={r.sku}>
            <div
              className={
                'cart-thumb art-' +
                (r.is_combo ? 'combo' : r.category === 'tra' ? 'tra' : r.category === 'banh' ? 'banh' : 'cafe')
              }
              aria-hidden="true"
            />
            <div className="cart-info">
              <Link className="cart-name" to={r.slug ? `/san-pham/${r.slug}` : '#'}>
                {r.missing ? `${r.sku} (ngừng bán)` : r.name}
              </Link>
              <div className="cart-price">{fmtVND(r.price)} / món</div>
              {r.stock === 'out_of_stock' ? <Badge tone="err">Hết hàng</Badge> : null}
            </div>
            <div className="cart-qty">
              <QuantityInput
                value={Number(r.qty)}
                min={0}
                max={100}
                label={`Số lượng ${r.name}`}
                onChange={(v) => setQty(r.sku, v)}
              />
            </div>
            <div className="cart-sum">
              <strong>{fmtVND(r.price * r.qty)}</strong>
            </div>
            <button type="button" className="icon-btn" aria-label={`Xóa ${r.name}`} onClick={() => removeRow(r)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        ))}
      </div>

      <div className="cart-total">
        <div>
          <span>Tạm tính</span>
          <strong>{fmtVND(total)}</strong>
          <small style={{ color: 'var(--ink-400)', display: 'block' }}>
            Giá server quyết định lúc checkout · phí ship tính lúc giao
          </small>
        </div>
        <div className="row">
          <Link
            className={'ui-btn btn-primary ui-btn-lg' + (hasOut ? ' disabled' : '')}
            to="/thanh-toan"
            aria-disabled={hasOut}
            onClick={(e) => { if (hasOut) e.preventDefault(); }}
          >
            Thanh toán →
          </Link>
          <Button variant="ghost" onClick={() => clearCart()}>Xóa giỏ</Button>
          <Link className="ui-btn btn-ghost" to="/san-pham">Mua thêm</Link>
        </div>
      </div>

      {/* Tong tien co dinh o day tren mobile */}
      <div className="cart-bar">
        <div className="cart-bar-inner">
          <div><small>Tạm tính</small><strong>{fmtVND(total)}</strong></div>
          <Link
            className={'ui-btn btn-primary' + (hasOut ? ' disabled' : '')}
            to="/thanh-toan"
            aria-disabled={hasOut}
            onClick={(e) => { if (hasOut) e.preventDefault(); }}
          >
            Thanh toán →
          </Link>
        </div>
      </div>
    </>
  );
}
