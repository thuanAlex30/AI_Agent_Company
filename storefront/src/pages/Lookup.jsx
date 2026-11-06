import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { lookupOrder } from '../services/api.js';
import { fmtVND } from '../utils/format.js';

const STEPS = [
  { key: 'received', label: 'Đã nhận' },
  { key: 'approved', label: 'Đã duyệt' },
  { key: 'making', label: 'Đang làm món' },
  { key: 'shipping', label: 'Đang giao' },
  { key: 'done', label: 'Hoàn tất' },
];

export default function Lookup({ toast }) {
  const [sp] = useSearchParams();
  const [code, setCode] = useState(sp.get('code') || '');
  const [contact, setContact] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e && e.preventDefault();
    setBusy(true); setData(null);
    try { setData(await lookupOrder(code.trim(), contact.trim())); }
    catch (ex) { toast && toast('Không tìm thấy đơn (kiểm tra mã + SĐT/email)'); }
    finally { setBusy(false); }
  }
  const cur = data?.timeline?.current;
  const curIdx = STEPS.findIndex((s) => s.key === cur);
  return (
    <>
      <h2>Tra cứu đơn</h2>
      <form className="card form" onSubmit={submit}>
        <label>Mã đơn (DHW-…)<input value={code} onChange={(e) => setCode(e.target.value)} required /></label>
        <label>SĐT hoặc email đã đặt<input value={contact} onChange={(e) => setContact(e.target.value)} required /></label>
        <button className="btn" disabled={busy} type="submit">{busy ? 'Đang tra…' : 'Tra cứu'}</button>
      </form>
      {data && (
        <div className="card">
          <h3>{data.code} · {data.status} · {fmtVND(data.amount)} (đã trả {fmtVND(data.paid)}, còn {fmtVND(data.remain)})</h3>
          {data.timeline?.cancelled
            ? <div className="alert">Đơn {data.timeline.current}.</div>
            : <div className="timeline">{STEPS.map((s, i) => <div key={s.key} className={i <= curIdx ? 'step done' : 'step'}><div className="dot">{i <= curIdx ? '✓' : i + 1}</div>{s.label}</div>)}</div>}
          {data.shipment && <p>Vận chuyển: {data.shipment.carrier || ''} · {data.shipment.status} · phí {fmtVND(data.shipment.ship_fee)}</p>}
        </div>
      )}
    </>
  );
}
