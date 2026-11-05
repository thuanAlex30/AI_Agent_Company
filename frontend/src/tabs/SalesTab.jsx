import { useEffect, useState } from 'react';
import { api, fmtVND, uuid } from '../api.js';

export default function SalesTab({ toast }) {
  const [leads, setLeads] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ln, setLn] = useState('');
  const [lp, setLp] = useState('');
  const [code, setCode] = useState('');
  const [cust, setCust] = useState('');
  const [sku, setSku] = useState('CF-SUA-01');
  const [qty, setQty] = useState(2);
  async function loadLeads() {
    try { setLeads(await api('/api/leads')); } catch (e) { toast(e.message); }
  }
  async function loadOrders() {
    try { setOrders(await api('/api/orders')); } catch (e) { toast(e.message); }
  }
  useEffect(() => { loadLeads(); loadOrders(); }, []);
  return (
    <>
      <div className="card"><h3>Leads</h3>
        <div className="row"><input value={ln} onChange={(e) => setLn(e.target.value)} placeholder="tên KH" /><input value={lp} onChange={(e) => setLp(e.target.value)} placeholder="sđt" />
        <button className="btn" onClick={async () => { try { await api('/api/leads', { method: 'POST', body: JSON.stringify({ name: ln, phone: lp }) }); toast('Đã thêm lead'); loadLeads(); } catch (e) { toast(e.message); } }}>Thêm lead</button></div>
        <table><tbody><tr><th>ID</th><th>Tên</th><th>SĐT</th><th>Stage</th><th></th></tr>
        {leads.slice(0, 30).map((l) => <tr key={l.id}><td>{l.id}</td><td>{l.name}</td><td>{l.phone}</td><td>{l.stage}</td><td>
          {(l.stage !== 'won' && l.stage !== 'lost') && <button className="btn small" onClick={async () => { try { const r = await api('/api/leads/' + l.id + '/convert', { method: 'POST' }); toast('Convert OK -> customer ' + r.customer_id); loadLeads(); } catch (e) { toast('Convert lỗi: ' + e.message); } }}>Convert</button>}
        </td></tr>)}
        </tbody></table>
      </div>
      <div className="card"><h3>Tạo đơn (trừ kho + receivable + shipment)</h3>
        <div className="row"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="mã đơn (vd DH101)" /><input value={cust} onChange={(e) => setCust(e.target.value)} placeholder="customer_id" type="number" />
        <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" /><input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty" type="number" />
        <button className="btn" onClick={async () => { try { await api('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ code: code.trim(), customer_id: Number(cust), items: [{ sku: sku.trim(), qty: Number(qty) }] }) }); toast('Đã tạo đơn'); loadOrders(); } catch (e) { toast('Tạo đơn lỗi: ' + e.message); } }}>Tạo đơn</button></div>
        <table><tbody><tr><th>Code</th><th>Amount</th><th>Status</th><th></th></tr>
        {orders.slice(0, 30).map((o) => <tr key={o.id}><td>{o.code}</td><td>{fmtVND(o.amount)}</td><td>{o.status}</td><td>
          <button className="btn small" onClick={async () => { try { await api('/api/orders/' + o.id + '/cancel', { method: 'POST' }); toast('Đã hủy ' + o.code); loadOrders(); } catch (e) { toast(e.message); } }}>Hủy</button>
          <button className="btn small" onClick={async () => { try { await api('/api/orders/' + o.id + '/refund', { method: 'POST' }); toast('Đã hoàn ' + o.code); loadOrders(); } catch (e) { toast(e.message); } }}>Hoàn</button>
        </td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}
