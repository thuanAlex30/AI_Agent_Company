import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function LegalTab({ toast }) {
  const [appr, setAppr] = useState([]);
  const [risks, setRisks] = useState([]);
  const [audit, setAudit] = useState([]);
  const [rkTitle, setRkTitle] = useState('');
  const [rkLevel, setRkLevel] = useState('medium');
  async function loadAppr() { try { setAppr(await api('/api/approvals')); } catch (e) { toast(e.message + (e.status === 403 ? ' (403 đúng quyền)' : '')); } }
  async function loadRisks() { try { setRisks(await api('/api/risks')); } catch (e) { toast(e.message); } }
  async function loadAudit() { try { setAudit(await api('/api/audit')); } catch (e) { toast(e.message + (e.status === 403 ? ' (403 đúng — chỉ cfo/ceo/legal/owner)' : '')); } }
  useEffect(() => { loadAppr(); loadRisks(); loadAudit(); }, []);
  return (
    <>
      <div className="card"><h3>Phê duyệt (requester không tự duyệt)</h3>
        <table><tbody><tr><th>ID</th><th>Loại</th><th>Ref</th><th>Level</th><th>Status</th><th></th></tr>
        {appr.filter((x) => x.status === 'pending').slice(0, 20).map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.ref_type}</td><td>{a.ref_id}</td><td>{a.level}</td><td>{a.status}</td><td>
          <button className="btn small" onClick={async () => { try { await api('/api/approvals/' + a.id + '/decide', { method: 'POST', body: JSON.stringify({ decision: 'approved' }) }); toast('Đã duyệt ' + a.id); loadAppr(); } catch (e) { toast(e.message); } }}>Duyệt</button>
          <button className="btn small" onClick={async () => { try { await api('/api/approvals/' + a.id + '/decide', { method: 'POST', body: JSON.stringify({ decision: 'rejected' }) }); toast('Đã từ chối'); loadAppr(); } catch (e) { toast(e.message); } }}>Từ chối</button>
        </td></tr>)}
        </tbody></table>
      </div>
      <div className="card"><h3>Rủi ro</h3>
        <div className="row"><input value={rkTitle} onChange={(e) => setRkTitle(e.target.value)} placeholder="tiêu đề rủi ro" style={{ minWidth: 220 }} />
        <select value={rkLevel} onChange={(e) => setRkLevel(e.target.value)}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></select>
        <button className="btn" onClick={async () => { try { await api('/api/risks', { method: 'POST', body: JSON.stringify({ title: rkTitle, level: rkLevel }) }); toast('Đã tạo risk'); loadRisks(); } catch (e) { toast(e.message); } }}>Tạo</button></div>
        <table><tbody><tr><th>Title</th><th>Level</th><th>Status</th></tr>
        {risks.slice(0, 20).map((r, i) => <tr key={i}><td>{r.title}</td><td>{r.level}</td><td>{r.status}</td></tr>)}
        </tbody></table>
      </div>
      <div className="card"><h3>Audit log</h3>
        <table><tbody><tr><th>Actor</th><th>Action</th><th>Table</th><th>Record</th></tr>
        {audit.slice(0, 20).map((r, i) => <tr key={i}><td>{r.actor}</td><td>{r.action}</td><td>{r.table_name}</td><td>{r.record_id}</td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}
