import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts, getProduct } from '../services/api.js';
import { fmtVND } from '../utils/format.js';
import { getCart, setQty, clearCart } from '../store/cart.js';

export default function Cart() {
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const fn = () => setTick((t) => t + 1);
    window.addEventListener('bizops-cart', fn);
    return () => window.removeEventListener('bizops-cart', fn);
  }, []);
  useEffect(() => {
    let alive = true;
    (async () => {
      const cart = getCart();
      let sum = 0;
      const out = [];
      for (const it of cart) {
        try {
          const p = await getProduct(it.sku);
          sum += Number(p.price) * Number(it.qty);
          out.push({ ...it, name: p.name, price: p.price, stock: p.stock });
        } catch { out.push({ ...it, name: it.sku, price: 0, stock: 'out_of_stock' }); }
      }
      if (alive) { setRows(out); setTotal(sum); }
    })();
    return () => { alive = false; };
  }, [tick]);
  if (!rows.length) return <div className="card"><h2>Giỏ trống</h2><p>Chưa có món nào.</p><Link className="btn" to="/san-pham">Xem thực đơn</Link></div>;
  return (
    <>
      <h2>Giỏ hàng</h2>
      <table><thead><tr><th>Món</th><th>Giá (server)</th><th>SL</th><th></th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.sku}><td>{r.name}</td><td>{fmtVND(r.price)}</td>
            <td><input type="number" min={0} max={100} value={r.qty} style={{ maxWidth: 80 }} onChange={(e) => setQty(r.sku, Number(e.target.value))} /></td>
            <td><button className="btn small ghost" onClick={() => setQty(r.sku, 0)}>Xóa</button></td></tr>
        ))}</tbody></table>
      <h3>Tạm tính: {fmtVND(total)} <small style={{ color: '#6b7280' }}>(giá server quyết định lúc checkout)</small></h3>
      <div className="row">
        <Link className="btn" to="/thanh-toan">→ Thanh toán</Link>
        <button className="btn ghost" onClick={() => clearCart()}>Xóa giỏ</button>
      </div>
    </>
  );
}
