import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProduct, postOrder } from '../services/api.js';
import { fmtVND, uuid } from '../utils/format.js';
import { getCart, clearCart } from '../store/cart.js';

export default function Checkout({ toast }) {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', note: '', pay_method: 'bank' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const cart = getCart();
      let sum = 0; const out = [];
      for (const it of cart) {
        try { const p = await getProduct(it.sku); sum += Number(p.price) * Number(it.qty); out.push({ ...it, name: p.name, price: p.price }); }
        catch { out.push({ ...it, name: it.sku, price: 0 }); }
      }
      setRows(out); setTotal(sum);
    })();
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (!rows.length) { toast && toast('Giỏ trống'); return; }
    setBusy(true);
    try {
      const key = uuid();
      const d = await postOrder({ ...f, items: rows.map((r) => ({ sku: r.sku, qty: Number(r.qty) })) }, key);
      clearCart();
      nav('/xac-nhan?code=' + encodeURIComponent(d.code) + '&token=' + encodeURIComponent(d.lookup_token || ''));
    } catch (ex) { toast && toast('Lỗi: ' + ex.message); }
    finally { setBusy(false); }
  }
  return (
    <>
      <h2>Thanh toán</h2>
      <div className="card"><strong>Tóm tắt ({rows.length} món): {fmtVND(total)}</strong>
        {rows.map((r) => <div key={r.sku}>{r.name} x{r.qty} — {fmtVND(r.price * r.qty)}</div>)}
      </div>
      <form className="card form" onSubmit={submit}>
        <label>Họ tên<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} /></label>
        <label>SĐT VN<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required placeholder="09xxxxxxxx" /></label>
        <label>Email<input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="không bắt buộc nếu có SĐT" /></label>
        <label>Địa chỉ<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
        <label>Ghi chú<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <label>Thanh toán
          <select value={f.pay_method} onChange={(e) => setF({ ...f, pay_method: e.target.value })}>
            <option value="bank">VietQR (quét mã)</option>
            <option value="cash">COD (tiền mặt khi nhận)</option>
            <option value="ewallet">Ví điện tử</option>
          </select>
        </label>
        {f.pay_method === 'bank' && <div className="alert">Quét VietQR với nội dung = mã đơn DHW sau khi đặt. Webhook tự gạch nợ.</div>}
        <button className="btn" disabled={busy || !rows.length} type="submit">{busy ? 'Đang đặt…' : 'Đặt hàng'}</button>
      </form>
    </>
  );
}
