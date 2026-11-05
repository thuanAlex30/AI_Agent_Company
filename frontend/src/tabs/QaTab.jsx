import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function QaTab({ toast }) {
  const [rows, setRows] = useState([]);
  const [type, setType] = useState('order');
  const [ref, setRef] = useState('');
  const [res, setRes] = useState('pass');
  const [defect, setDefect] = useState('');
  async function load() { try { setRows(await api('/api/qa-checks')); } catch (e) { toast(e.message); } }
  useEffect(() => { load(); }, []);
  const t = rows.length, f = rows.filter((r) => r.result === 'fail').length;
  const passPct = t ? Math.round((t - f) / t * 1000) / 10 : 100;
  const rep = rows.filter((r) => r.repeat_of != null).length;
  return (
    <div className="card"><h3>Kiểm tra chất lượng</h3>
      <div className="row"><select value={type} onChange={(e) => setType(e.target.value)}><option value="order">order</option><option value="shipment">shipment</option><option value="product">product</option></select>
      <input value={ref} onChange={(e) => setRef(e.target.value)} type="number" placeholder="ref_id" />
      <select value={res} onChange={(e) => setRes(e.target.value)}><option value="pass">pass</option><option value="fail">fail</option></select>
      <input value={defect} onChange={(e) => setDefect(e.target.value)} placeholder="defect (nếu fail)" />
      <button className="btn" onClick={async () => { try { await api('/api/qa-checks', { method: 'POST', body: JSON.stringify({ ref_type: type, ref_id: Number(ref), result: res, defect: defect || null }) }); toast('Đã ghi QA'); load(); } catch (e) { toast(e.message); } }}>Ghi</button></div>
      <p>Pass: {passPct}% ({t - f}/{t}) | Repeat: {rep}</p>
      <table><tbody><tr><th>Ref</th><th>Result</th><th>Defect</th><th>Repeat_of</th></tr>
      {rows.slice(0, 20).map((r, i) => <tr key={i}><td>{r.ref_type}#{r.ref_id}</td><td>{r.result}</td><td>{r.defect}</td><td>{r.repeat_of}</td></tr>)}
      </tbody></table>
    </div>
  );
}
