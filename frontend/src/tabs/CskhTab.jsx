import { useState } from 'react';
import { api, timeLeft } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, StatusBadge, useMutation } from '../components/ui.jsx';

const CATS = ['easy', 'technical', 'legal', 'complaint', 'policy_inquiry'];

async function loadCskh() {
  const [tickets, csat] = await Promise.all([api('/api/cskh/tickets'), api('/api/cskh/csat')]);
  return { tickets: tickets || [], csat: csat || null };
}

export default function CskhTab({ toast }) {
  const { data, loading, error, reload } = useQuery(loadCskh, []);
  const [msg, setMsg] = useState('');
  const [outs, setOuts] = useState([]);
  const [content, setContent] = useState('');
  const [cat, setCat] = useState('easy');
  const [pri, setPri] = useState('normal');
  const [cust, setCust] = useState('');
  const [order, setOrder] = useState('');
  const [stars, setStars] = useState('');
  const [slaCount, setSlaCount] = useState(null);
  const m = useMutation(async (kind, payload) => {
    if (kind === 'chat') {
      const r = await api('/api/cskh/chat', { method: 'POST', body: JSON.stringify({ message: payload }) });
      setOuts((o) => [...o, 'Bot: ' + r.reply]);
      if (r.createTicket) reload();
    } else if (kind === 'ticket') {
      await api('/api/cskh/tickets', { method: 'POST', body: JSON.stringify({ content: payload.content, category: payload.cat, priority: payload.pri }) });
      toast('Đã tạo ticket', 'ok'); setContent(''); reload();
    } else if (kind === 'patch') {
      await api('/api/cskh/tickets/' + payload.id, { method: 'PATCH', body: JSON.stringify({ status: payload.status }) });
      toast('Ticket → ' + payload.status, 'ok'); reload();
    } else if (kind === 'rating') {
      const oid = Number(payload.order) || null;
      await api('/api/ratings', { method: 'POST', body: JSON.stringify({ customer_id: Number(payload.cust), order_id: oid, ticket_id: oid, stars: Number(payload.stars) }) });
      toast('Đã đánh giá', 'ok'); reload();
    }
  });

  async function checkSla() {
    try { const rows = await api('/api/cskh/sla'); setSlaCount(rows.length); toast('Trễ SLA: ' + rows.length + ' ticket', rows.length ? 'err' : 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  }

  if (loading) return (<><PageHeader title="Chăm sóc khách hàng" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Chăm sóc khách hàng" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);
  const { tickets, csat } = data;

  return (
    <>
      <PageHeader title="Chăm sóc khách hàng" desc="Chat hỗ trợ, ticket theo SLA giờ lịch (urgent 2h / high 4h / normal 24h / low 72h), CSAT."
        actions={<span className="btn-row"><button className="btn small ghost" onClick={checkSla}>List trễ SLA{slaCount != null ? ` (${slaCount})` : ''}</button><button className="btn small ghost" onClick={reload}>Tải lại</button></span>} />

      <SectionCard title="Chat CSKH" desc="POST /api/cskh/chat — qua Agent service. Không log nội dung chat ra console.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!msg.trim()) return; const v = msg.trim(); setMsg(''); m.run('chat', v).catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Tin nhắn"><input className="input" style={{ minWidth: 280 }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="nhập tin nhắn" aria-label="Tin nhắn chat CSKH" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Gửi</button>
        </form>
        <div className="chat-out" aria-live="polite">{outs.map((o, i) => <p key={i}>{o}</p>)}</div>
      </SectionCard>

      <SectionCard title="Tickets">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!content.trim()) { toast('Nhập nội dung ticket', 'err'); return; } m.run('ticket', { content: content.trim(), cat, pri }).catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Nội dung"><input className="input" style={{ minWidth: 220 }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="nội dung" /></FormField>
          <FormField label="Loại"><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></FormField>
          <FormField label="Ưu tiên"><select className="input" value={pri} onChange={(e) => setPri(e.target.value)}><option value="low">low</option><option value="normal">normal</option><option value="high">high</option><option value="urgent">urgent</option></select></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Tạo ticket</button>
        </form>
        <DataTable
          columns={[
            { key: 'code', head: 'Code' },
            { key: 'category', head: 'Cat', render: (k) => <StatusBadge value={k.category} /> },
            { key: 'priority', head: 'Priority', render: (k) => <StatusBadge value={k.priority} /> },
            { key: 'sla', head: 'SLA due', render: (k) => (k.sla_due || '—') + (k.sla_due ? ' · ' + timeLeft(k.sla_due) : '') },
            { key: 'status', head: 'Status', render: (k) => <StatusBadge value={k.status} /> },
            { key: 'act', head: '', render: (k) => (<span className="btn-row">
              <button className="btn small ghost" disabled={m.busy} onClick={() => m.run('patch', { id: k.id, status: 'processing' }).catch((e2) => toast(e2.message, 'err'))}>Tiếp nhận</button>
              <button className="btn small ghost" disabled={m.busy} onClick={() => m.run('patch', { id: k.id, status: 'resolved' }).catch((e2) => toast(e2.message, 'err'))}>Resolve</button>
            </span>) },
          ]}
          rows={tickets.slice(0, 20)} keyOf={(k) => k.id}
          empty={{ title: 'Chưa có ticket', hint: 'Tạo ticket đầu tiên bằng form phía trên.' }} />
      </SectionCard>

      <SectionCard title="CSAT + Rating" desc="GET /api/cskh/csat, POST /api/ratings — stars 1–5 bắt buộc.">
        <p>CSAT trung bình: <strong>{csat ? `${csat.avg} (${csat.count} lượt)` : '—'}</strong></p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); const s = Number(stars); if (!cust || !(s >= 1 && s <= 5)) { toast('Nhập customer_id và stars 1–5', 'err'); return; } m.run('rating', { cust, order, stars }).then(() => { setCust(''); setOrder(''); setStars(''); }).catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Customer ID"><input className="input" value={cust} onChange={(e) => setCust(e.target.value)} type="number" min="1" placeholder="customer_id" /></FormField>
          <FormField label="Order/Ticket ID"><input className="input" value={order} onChange={(e) => setOrder(e.target.value)} type="number" min="1" placeholder="order_id (hoặc ticket)" /></FormField>
          <FormField label="Stars 1–5"><input className="input" value={stars} onChange={(e) => setStars(e.target.value)} type="number" min="1" max="5" placeholder="stars 1-5" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Đánh giá</button>
        </form>
      </SectionCard>
    </>
  );
}
