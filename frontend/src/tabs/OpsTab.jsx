import { useEffect, useState } from 'react';
import { api, fmtVND, uuid } from '../api.js';

export default function OpsTab({ toast }) {
  const [stock, setStock] = useState([]);
  const [ships, setShips] = useState([]);
  const [pos, setPos] = useState([]);
  const [sku, setSku] = useState('CF-SUA-01');
  const [qty, setQty] = useState(10);
  const [poCode, setPoCode] = useState('');
  const [poAmt, setPoAmt] = useState('');
  async function loadStock() { try { setStock(await api('/api/products')); } catch (e) { toast(e.message); } }
  async function loadShip() { try { setShips(await api('/api/shipments')); } catch (e) { toast(e.message); } }
  async function loadPO() { try { setPos(await api('/api/purchase-orders')); } catch (e) { toast(e.message); } }
  useEffect(() => { loadStock(); loadShip(); loadPO(); }, []);
  return (
    <>
      <div className="card"><h3>Tồn kho</h3>
        <table><tbody><tr><th>SKU</th><th>Tên</th><th>Tồn</th><th>Ngưỡng</th></tr>
        {stock.map((p) => <tr key={p.sku}><td>{p.sku}</td><td>{p.name}</td><td className={Number(p.stock) <= Number(p.stock_alert) ? 'stock-low' : ''}>{p.stock}</td><td>{p.stock_alert}</td></tr>)}
        </tbody></table>
      </div>
      <div className="card"><h3>Nhập / Xuất kho</h3>
        <div className="row"><input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" /><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty" type="number" />
        <button className="btn" onClick={async () => { try { await api('/api/stock/in', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ sku: sku.trim(), qty: Number(qty) }) }); toast('Đã nhập kho'); loadStock(); } catch (e) { toast(e.message); } }}>Nhập</button>
        <button className="btn" onClick={async () => { try { await api('/api/stock/out', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ sku: sku.trim(), qty: Number(qty) }) }); toast('Đã xuất kho'); loadStock(); } catch (e) { toast(e.message); } }}>Xuất</button></div>
      </div>
      <div className="card"><h3>Vận đơn</h3>
        <table><tbody><tr><th>ID</th><th>Đơn</th><th>Status</th><th></th></tr>
        {ships.slice(0, 20).map((s) => {
          const next = s.status === 'pending' ? 'shipping' : s.status === 'shipping' ? 'done' : null;
          return <tr key={s.id}><td>{s.id}</td><td>{s.order_id}</td><td>{s.status}</td><td>{next && <button className="btn small" onClick={async () => { try { await api('/api/shipments/' + s.id, { method: 'PATCH', body: JSON.stringify({ status: next }) }); toast('Cập nhật ' + next); loadShip(); } catch (e) { toast(e.message); } }}>-&gt; {next}</button>}</td></tr>;
        })}
        </tbody></table>
      </div>
      <div className="card"><h3>PO + Receive</h3>
        <div className="row"><input value={poCode} onChange={(e) => setPoCode(e.target.value)} placeholder="mã PO" /><input value={poAmt} onChange={(e) => setPoAmt(e.target.value)} placeholder="amount" type="number" />
        <button className="btn" onClick={async () => { try { await api('/api/purchase-orders', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ code: poCode.trim(), amount: Number(poAmt) }) }); toast('Đã tạo PO'); loadPO(); } catch (e) { toast(e.message); } }}>Tạo PO</button></div>
        <table><tbody><tr><th>Code</th><th>Amount</th><th>Status</th><th></th></tr>
        {pos.slice(0, 20).map((p) => <tr key={p.id}><td>{p.code}</td><td>{fmtVND(p.amount)}</td><td>{p.status}</td><td><button className="btn small" onClick={async () => { try { await api('/api/purchase-orders/' + p.id + '/receive', { method: 'POST', body: JSON.stringify({ items: [] }) }); toast('Đã receive ' + p.code); loadPO(); loadStock(); } catch (e) { toast(e.message); } }}>Receive</button></td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}
