import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getServices, postServiceReq } from '../services/api.js';

export default function Services({ toast }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ service_id: 'DV-TEABREAK', name: '', phone: '', slot_time: '', party_size: 30, location: '', tax_code: '', note: '' });
  const [done, setDone] = useState(null);
  useEffect(() => { getServices().then((d) => setItems(Array.isArray(d) ? d : d.items || [])).catch((e) => setErr(e.message)); }, []);
  async function submit(e) {
    e.preventDefault();
    setDone(null);
    try {
      const d = await postServiceReq({ ...f, party_size: Number(f.party_size) || undefined });
      setDone(d);
      toast && toast('Đã nhận yêu cầu ' + d.code);
    } catch (ex) { toast && toast('Lỗi: ' + ex.message); }
  }
  return (
    <>
      <h2>Dịch vụ</h2>
      {err && <div className="alert">{err}</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {(items || []).map((s) => (
          <div className="card" key={s.code || s.id}><h3>{s.name}</h3><p style={{ color: '#6b7280' }}>{s.description || ''}</p><span className="pill">{s.code}</span></div>
        ))}
      </div>
      <h2>Đặt lịch / báo giá teabreak</h2>
      <form className="card form" onSubmit={submit}>
        <label>Tên<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} /></label>
        <label>SĐT VN<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required placeholder="09xxxxxxxx" /></label>
        <label>Dịch vụ<select value={f.service_id} onChange={(e) => setF({ ...f, service_id: e.target.value })}>{(items || []).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
        <label>Ngày giờ (tương lai)<input type="datetime-local" value={f.slot_time} onChange={(e) => setF({ ...f, slot_time: e.target.value.replace('T', ' ') })} /></label>
        <label>Số người<input type="number" min={1} max={1000} value={f.party_size} onChange={(e) => setF({ ...f, party_size: e.target.value })} /></label>
        <label>Địa điểm<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
        <label>MST (nếu cần VAT)<input value={f.tax_code} onChange={(e) => setF({ ...f, tax_code: e.target.value })} placeholder="10 hoặc 13 số" /></label>
        <label>Ghi chú<textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={3} /></label>
        <button className="btn" type="submit">Gửi yêu cầu</button>
      </form>
      {done && <div className="alert">Đã nhận mã <strong>{done.code}</strong> + phiếu {done.ticket}. CSKH báo giá trong 24h.</div>}
      <p><Link to="/">← Về cửa hàng</Link></p>
    </>
  );
}
