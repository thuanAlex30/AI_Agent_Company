import { useEffect, useState } from 'react';
import { api, fmtVND, timeLeft, uuid } from '../api.js';

export default function FinanceTab({ toast }) {
  const [debts, setDebts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [kpi, setKpi] = useState('');
  const [debtId, setDebtId] = useState('');
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('cash');
  const [csvOut, setCsvOut] = useState('');
  async function loadDebts() {
    try { setDebts(await api('/api/debts')); } catch (e) { toast(e.message); }
  }
  async function loadTx() {
    try { setTxs(await api('/api/transactions')); } catch (e) { toast(e.message); }
  }
  useEffect(() => { loadDebts(); loadTx(); }, []);
  async function uploadCsv(e) {
    const f = e.target.files[0];
    if (!f) { toast('Chọn file CSV trước'); return; }
    try {
      const fd = new FormData(); fd.append('file', f);
      const res = await fetch('/api/transactions/import-csv', { method: 'POST', credentials: 'include', body: fd });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error.message);
      setCsvOut(`Import: ${body.data.imported} / skipped ${body.data.skipped} / total ${body.data.total}`);
      loadTx();
    } catch (err) { toast(err.message); }
  }
  return (
    <>
      <div className="card"><h3>Công nợ phải thu</h3>
        <div className="row">
          <button className="btn" onClick={async () => { try { const r = await api('/api/debts/remind-all', { method: 'POST' }); toast('Nhắc xong: gửi ' + r.sent + '/' + r.total); } catch (e) { toast(e.message); } }}>Nhắc tất cả (1 click)</button>
          <button className="btn" onClick={async () => { try { const r = await api('/api/reconcile/run', { method: 'POST' }); toast('Đối soát: matched ' + r.matched + '/' + r.total); loadDebts(); loadTx(); } catch (e) { toast(e.message); } }}>Chạy đối soát</button>
          <button className="btn" onClick={async () => { try { const k = await api('/api/finance/kpis'); setKpi(`AR: ${fmtVND(k.ar)} | DSO: ${k.dso} ngày | Thu: ${fmtVND(k.thu)} | Chi: ${fmtVND(k.chi)}`); } catch (e) { toast(e.message); } }}>KPI</button>
        </div>
        <p>{kpi}</p>
        <table><tbody><tr><th>ID</th><th>Đơn</th><th>Amount</th><th>Paid</th><th>Remain</th><th>Due</th><th>Status</th><th></th></tr>
        {debts.filter((x) => x.type === 'receivable').slice(0, 30).map((d) => (
          <tr key={d.id}><td>{d.id}</td><td>{d.order_id}</td><td>{fmtVND(d.amount)}</td><td>{fmtVND(d.paid)}</td><td>{fmtVND(Number(d.amount) - Number(d.paid))}</td><td>{(d.due_date || '') + ' ' + timeLeft(d.due_date)}</td><td>{d.status}</td>
          <td><button className="btn small" onClick={async () => { try { const r = await api('/api/debts/' + d.id + '/remind', { method: 'POST' }); toast('Đã nhắc: ' + r.sent_date); } catch (e) { toast(e.message); } }}>Nhắc</button></td></tr>))}
        </tbody></table>
      </div>
      <div className="card"><h3>Ghi payment (Idempotency-Key tự sinh)</h3>
        <div className="row"><input value={debtId} onChange={(e) => setDebtId(e.target.value)} placeholder="debt_id" type="number" /><input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="amount" type="number" />
        <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">cash</option><option value="bank">bank</option><option value="ewallet">ewallet</option></select>
        <button className="btn" onClick={async () => { try { await api('/api/payments', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ debt_id: Number(debtId), amount: Number(amt), method }) }); toast('Đã ghi payment'); loadDebts(); } catch (e) { toast(e.message); } }}>Ghi payment</button></div>
      </div>
      <div className="card"><h3>Import sao kê CSV + review</h3>
        <div className="row"><input type="file" accept=".csv" onChange={uploadCsv} /></div>
        <div>{csvOut}</div>
      </div>
      <div className="card"><h3>Giao dịch unmatched (review khi hòa điểm)</h3>
        <table><tbody><tr><th>Bank ref</th><th>Amount</th><th>Content</th><th>Status</th></tr>
        {txs.filter((x) => x.status === 'unmatched').slice(0, 20).map((x) => <tr key={x.id || x.bank_ref}><td>{x.bank_ref}</td><td>{fmtVND(x.amount)}</td><td>{x.content}</td><td>{x.status} (cần review)</td></tr>)}
        </tbody></table>
      </div>
    </>
  );
}
