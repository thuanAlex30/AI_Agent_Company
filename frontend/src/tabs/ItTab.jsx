import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function ItTab({ toast }) {
  const [health, setHealth] = useState(null);
  const [rows, setRows] = useState([]);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [sev, setSev] = useState('p3');
  async function loadHealth() { try { setHealth(await api('/api/it/health')); } catch (e) { toast(e.message); } }
  async function loadList() { try { setRows(await api('/api/it-incidents')); } catch (e) { toast(e.message); } }
  useEffect(() => { loadHealth(); loadList(); }, []);
  return (
    <>
      <div className="card"><h3>IT Health</h3><p>{health ? `Mở: ${health.open} | P1 mở: ${health.p1_open} | MTTR: ${health.mttr_min ?? '-'}p | Uptime (ước tính): ${health.uptime_estimate}% — ${health.note}` : 'Đang tải...'}</p></div>
      <div className="card"><h3>Sự cố</h3>
        <div className="row"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="mã (INC-...)" /><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="tiêu đề" style={{ minWidth: 220 }} />
        <select value={sev} onChange={(e) => setSev(e.target.value)}><option value="p1">p1</option><option value="p2">p2</option><option value="p3">p3</option><option value="p4">p4</option></select>
        <button className="btn" onClick={async () => { try { await api('/api/it-incidents', { method: 'POST', body: JSON.stringify({ code: code.trim(), title, severity: sev }) }); toast('Đã tạo incident'); loadList(); loadHealth(); } catch (e) { toast(e.message); } }}>Tạo</button></div>
        <table><tbody><tr><th>Code</th><th>Title</th><th>Sev</th><th>Status</th><th></th></tr>
        {rows.slice(0, 20).map((r) => <tr key={r.id}><td>{r.code}</td><td>{r.title}</td><td>{r.severity}</td><td>{r.status}</td><td>
          <button className="btn small" onClick={async () => { try { await api('/api/it-incidents/' + r.id, { method: 'PATCH', body: JSON.stringify({ status: 'fixing' }) }); loadList(); loadHealth(); } catch (e) { toast(e.message); } }}>Fixing</button>
          <button className="btn small" onClick={async () => { try { await api('/api/it-incidents/' + r.id, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }); loadList(); loadHealth(); } catch (e) { toast(e.message); } }}>Resolve</button>
        </td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}
