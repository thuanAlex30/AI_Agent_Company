import { useEffect, useState } from 'react';
import { api } from '../api.js';

const STAGES = ['idea', 'spec', 'building', 'testing', 'released'];

export default function ProductTab({ toast }) {
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState('');
  async function load() { try { setRows(await api('/api/product-features')); } catch (e) { toast(e.message); } }
  useEffect(() => { load(); }, []);
  return (
    <div className="card"><h3>Tính năng sản phẩm (kanban)</h3>
      <div className="row"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="tên tính năng" style={{ minWidth: 220 }} />
      <button className="btn" onClick={async () => { try { await api('/api/product-features', { method: 'POST', body: JSON.stringify({ title }) }); toast('Đã tạo feature'); load(); } catch (e) { toast(e.message); } }}>Tạo</button></div>
      <div className="row">{STAGES.map((s) => (
        <div className="card" key={s} style={{ minWidth: 180 }}><h4>{s}</h4>
        {rows.filter((x) => x.stage === s).map((r, i) => <p key={i}>{r.title}</p>)}
        </div>))}
      </div>
    </div>
  );
}
