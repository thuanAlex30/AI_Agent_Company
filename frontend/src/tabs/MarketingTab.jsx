import { useEffect, useState } from 'react';
import { api, fmtVND } from '../api.js';

export default function MarketingTab({ toast }) {
  const [rows, setRows] = useState([]);
  const [name, setName] = useState('');
  const [ch, setCh] = useState('facebook');
  const [cost, setCost] = useState('');
  async function load() { try { setRows(await api('/api/marketing/roi')); } catch (e) { toast(e.message); } }
  useEffect(() => { load(); }, []);
  return (
    <div className="card"><h3>Chiến dịch + ROI</h3>
      <div className="row"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="tên chiến dịch" />
      <select value={ch} onChange={(e) => setCh(e.target.value)}><option value="facebook">facebook</option><option value="tiktok">tiktok</option><option value="zalo">zalo</option><option value="shopee">shopee</option><option value="offline">offline</option><option value="seo">seo</option></select>
      <input value={cost} onChange={(e) => setCost(e.target.value)} type="number" placeholder="cost" />
      <button className="btn" onClick={async () => { try { await api('/api/campaigns', { method: 'POST', body: JSON.stringify({ name, channel: ch, cost: Number(cost) || 0 }) }); toast('Đã tạo chiến dịch'); load(); } catch (e) { toast(e.message); } }}>Tạo</button></div>
      <table><tbody><tr><th>Campaign</th><th>Cost</th><th>Leads</th><th>Orders</th><th>CPO</th></tr>
      {rows.map((r, i) => <tr key={i}><td>{r.name}</td><td>{fmtVND(r.cost)}</td><td>{r.leads}</td><td>{r.orders}</td><td className={r.cpo_alert ? 'stock-low' : ''}>{r.cpo != null ? fmtVND(r.cpo) + (r.cpo_alert ? ' (cao >200k!)' : '') : '-'}</td></tr>)}
      </tbody></table>
    </div>
  );
}
