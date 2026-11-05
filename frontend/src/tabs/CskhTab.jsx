import { useEffect, useState } from 'react';
import { api, timeLeft } from '../api.js';

const CATS = ['easy', 'technical', 'legal', 'complaint', 'policy_inquiry'];

export default function CskhTab({ toast }) {
  const [msg, setMsg] = useState('');
  const [outs, setOuts] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [content, setContent] = useState('');
  const [cat, setCat] = useState('easy');
  const [pri, setPri] = useState('normal');
  const [csat, setCsat] = useState(null);
  const [cust, setCust] = useState('');
  const [order, setOrder] = useState('');
  const [stars, setStars] = useState('');
  async function loadTickets() { try { setTickets(await api('/api/cskh/tickets')); } catch (e) { toast(e.message); } }
  async function loadCsat() { try { setCsat(await api('/api/cskh/csat')); } catch (e) { toast(e.message); } }
  useEffect(() => { loadTickets(); loadCsat(); }, []);
  async function send() {
    try {
      const r = await api('/api/cskh/chat', { method: 'POST', body: JSON.stringify({ message: msg }) });
      setOuts((o) => [...o, 'Bot: ' + r.reply]);
      if (r.createTicket) loadTickets();
    } catch (e) { toast(e.message); }
  }
  return (
    <>
      <div className="card"><h3>Chat CSKH (qua Agent service :3100)</h3>
        <div className="row"><input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="nhập tin nhắn" style={{ minWidth: 280 }} onKeyDown={(e) => e.key === 'Enter' && send()} /><button className="btn" onClick={send}>Gửi</button></div>
        <div className="chat-out">{outs.map((o, i) => <p key={i}>{o}</p>)}</div>
      </div>
      <div className="card"><h3>Tickets (SLA giờ lịch: urgent 2h / high 4h / normal 24h / low 72h)</h3>
        <div className="row"><input value={content} onChange={(e) => setContent(e.target.value)} placeholder="nội dung" style={{ minWidth: 220 }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select value={pri} onChange={(e) => setPri(e.target.value)}><option value="low">low</option><option value="normal">normal</option><option value="high">high</option><option value="urgent">urgent</option></select>
        <button className="btn" onClick={async () => { try { await api('/api/cskh/tickets', { method: 'POST', body: JSON.stringify({ content, category: cat, priority: pri }) }); toast('Đã tạo ticket'); loadTickets(); } catch (e) { toast(e.message); } }}>Tạo ticket</button>
        <button className="btn ghost" onClick={async () => { try { const rows = await api('/api/cskh/sla'); toast('Trễ SLA: ' + rows.length + ' ticket'); } catch (e) { toast(e.message); } }}>List trễ SLA</button></div>
        <table><tbody><tr><th>Code</th><th>Cat</th><th>Priority</th><th>SLA due</th><th>Status</th><th></th></tr>
        {tickets.slice(0, 20).map((k) => <tr key={k.id}><td>{k.code}</td><td>{k.category}</td><td>{k.priority}</td><td>{(k.sla_due || '') + ' (' + timeLeft(k.sla_due) + ')'}</td><td>{k.status}</td>
        <td><button className="btn small" onClick={async () => { try { await api('/api/cskh/tickets/' + k.id, { method: 'PATCH', body: JSON.stringify({ status: 'processing' }) }); loadTickets(); } catch (e) { toast(e.message); } }}>Tiếp nhận</button>
        <button className="btn small" onClick={async () => { try { await api('/api/cskh/tickets/' + k.id, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) }); loadTickets(); } catch (e) { toast(e.message); } }}>Resolve</button></td></tr>)}
        </tbody></table>
      </div>
      <div className="card"><h3>CSAT + Rating (stars bắt buộc)</h3>
        <p>CSAT trung bình: {csat ? `${csat.avg} (${csat.count} lượt)` : 'Đang tải...'}</p>
        <div className="row"><input value={cust} onChange={(e) => setCust(e.target.value)} type="number" placeholder="customer_id" /><input value={order} onChange={(e) => setOrder(e.target.value)} type="number" placeholder="order_id (hoặc ticket)" />
        <input value={stars} onChange={(e) => setStars(e.target.value)} type="number" min="1" max="5" placeholder="stars 1-5" />
        <button className="btn" onClick={async () => { try { const oid = Number(order); await api('/api/ratings', { method: 'POST', body: JSON.stringify({ customer_id: Number(cust), order_id: oid || null, ticket_id: oid || null, stars: Number(stars) }) }); toast('Đã đánh giá'); loadCsat(); } catch (e) { toast(e.message); } }}>Đánh giá</button></div>
      </div>
    </>
  );
}
