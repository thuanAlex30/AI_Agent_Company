import { useState } from 'react';
import { api, apiUpload, fmtVND, timeLeft, uuid } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { ConfirmDialog, DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, StatusBadge, useMutation } from '../components/ui.jsx';

async function loadFinance() {
  const [debts, txs] = await Promise.all([api('/api/debts'), api('/api/transactions')]);
  return { debts: debts || [], txs: txs || [] };
}

export default function FinanceTab({ toast }) {
  const { data, loading, error, reload } = useQuery(loadFinance, []);
  const [kpi, setKpi] = useState(null);
  const [debtId, setDebtId] = useState('');
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('cash');
  const [csvOut, setCsvOut] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const m = useMutation(async (kind, payload) => {
    if (kind === 'payment') {
      await api('/api/payments', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ debt_id: Number(payload.debtId), amount: Number(payload.amt), method: payload.method }) });
      toast('Đã ghi payment', 'ok'); setDebtId(''); setAmt('');
    } else if (kind === 'remind') {
      const r = await api('/api/debts/' + payload.id + '/remind', { method: 'POST' });
      toast('Đã nhắc: ' + (r.sent_date || 'ok'), 'ok');
    } else if (kind === 'remind-all') {
      const r = await api('/api/debts/remind-all', { method: 'POST' });
      toast('Nhắc xong: gửi ' + r.sent + '/' + r.total, 'ok');
    } else if (kind === 'reconcile') {
      const r = await api('/api/reconcile/run', { method: 'POST' });
      toast('Đối soát: matched ' + r.matched + '/' + r.total, 'ok');
    }
    setConfirm(null);
    reload();
  });

  async function loadKpi() {
    try { setKpi(await api('/api/finance/kpis')); } catch (e) { toast(e.message, 'err'); }
  }

  async function uploadCsv(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) { toast('Chọn file CSV trước', 'err'); return; }
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', f);
      const out = await apiUpload('/api/transactions/import-csv', fd);
      const skipped = out.skipped ?? 0, invalid = out.invalid ?? 0, total = out.total ?? out.imported ?? 0;
      setCsvOut(`Import: ${out.imported} / skipped ${skipped}${invalid ? ' / invalid ' + invalid : ''} / total ${total}`);
      toast('Import CSV xong', 'ok');
      reload();
    } catch (err) { toast(err.message, 'err'); } finally { setUploading(false); }
  }

  if (loading) return (<><PageHeader title="Tài chính" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Tài chính" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);
  const { debts, txs } = data;
  const recv = debts.filter((x) => x.type === 'receivable');
  const unmatched = txs.filter((x) => x.status === 'unmatched');

  return (
    <>
      <PageHeader title="Tài chính" desc="Công nợ, payment, đối soát, import sao kê. Payment là nghiệp vụ — luôn xác nhận trước khi gửi."
        actions={<span className="btn-row">
          <button className="btn small ghost" disabled={m.busy} onClick={() => m.run('remind-all').catch((e) => toast(e.message, 'err'))}>Nhắc tất cả</button>
          <button className="btn small ghost" disabled={m.busy} onClick={() => m.run('reconcile').catch((e) => toast(e.message, 'err'))}>Chạy đối soát</button>
          <button className="btn small ghost" onClick={loadKpi}>KPI</button>
          <button className="btn small ghost" onClick={reload}>Tải lại</button>
        </span>} />
      {kpi && <div className="kpis">
        <div className="kpi"><small>Công nợ phải thu (AR)</small><strong>{fmtVND(kpi.ar)}</strong></div>
        <div className="kpi"><small>DSO</small><strong>{kpi.dso != null ? kpi.dso + ' ngày' : '—'}</strong></div>
        <div className="kpi"><small>Thu</small><strong>{fmtVND(kpi.thu)}</strong></div>
        <div className="kpi"><small>Chi</small><strong>{fmtVND(kpi.chi)}</strong></div>
      </div>}

      <SectionCard title="Công nợ phải thu" desc="Từ /api/debts. Nhắc nợ gửi 1 lần, không retry tự động.">
        <DataTable caption="30 khoản receivable gần nhất"
          columns={[
            { key: 'id', head: 'ID' },
            { key: 'order_id', head: 'Đơn' },
            { key: 'amount', head: 'Amount', render: (d) => fmtVND(d.amount) },
            { key: 'paid', head: 'Paid', render: (d) => fmtVND(d.paid) },
            { key: 'remain', head: 'Còn lại', render: (d) => fmtVND(Number(d.amount) - Number(d.paid)) },
            { key: 'due', head: 'Due', render: (d) => (d.due_date || '—') + (d.due_date ? ' · ' + timeLeft(d.due_date) : '') },
            { key: 'status', head: 'Status', render: (d) => <StatusBadge value={d.status} /> },
            { key: 'act', head: '', render: (d) => <button className="btn small ghost" disabled={m.busy} onClick={() => setConfirm({ kind: 'remind', payload: d })}>Nhắc</button> },
          ]}
          rows={recv.slice(0, 30)} keyOf={(d) => d.id}
          empty={{ title: 'Không có công nợ phải thu', hint: 'Đơn mới tạo sẽ sinh receivable tại đây.' }} />
      </SectionCard>

      <SectionCard title="Ghi payment" desc="POST /api/payments. Giữ Idempotency-Key cho cùng một thao tác — không sinh key mới khi retry thủ công.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!debtId || !amt) { toast('Nhập debt_id và amount', 'err'); return; } setConfirm({ kind: 'payment', payload: { debtId, amt, method } }); }}>
          <FormField label="Debt ID"><input className="input" value={debtId} onChange={(e) => setDebtId(e.target.value)} placeholder="debt_id" type="number" min="1" /></FormField>
          <FormField label="Số tiền (VND)"><input className="input" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="amount" type="number" min="1" /></FormField>
          <FormField label="Phương thức"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">cash</option><option value="bank">bank</option><option value="ewallet">ewallet</option></select></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Ghi payment</button>
        </form>
      </SectionCard>

      <SectionCard title="Import sao kê CSV" desc="POST /api/transactions/import-csv (multipart).">
        <div className="row">
          <FormField label="File CSV"><input className="input" type="file" accept=".csv" onChange={uploadCsv} disabled={uploading} aria-label="Chọn file CSV sao kê" /></FormField>
          {uploading && <span>Đang tải lên…</span>}
        </div>
        {csvOut && <div className="alert ok" role="status">{csvOut}</div>}
      </SectionCard>

      <SectionCard title="Giao dịch chưa đối soát" desc="Từ /api/transactions — review thủ công khi đối soát hòa điểm.">
        <DataTable
          columns={[
            { key: 'bank_ref', head: 'Bank ref' },
            { key: 'amount', head: 'Amount', render: (x) => fmtVND(x.amount) },
            { key: 'content', head: 'Content' },
            { key: 'status', head: 'Status', render: (x) => <StatusBadge value={x.status + ' (cần review)'} tone="warn" /> },
          ]}
          rows={unmatched.slice(0, 20)} keyOf={(x) => x.id || x.bank_ref}
          empty={{ title: 'Không có giao dịch unmatched', hint: 'Mọi giao dịch đã được đối soát.' }} />
      </SectionCard>

      <ConfirmDialog open={!!confirm}
        title={confirm?.kind === 'payment' ? 'Xác nhận ghi payment?' : confirm?.kind === 'remind' ? 'Gửi nhắc nợ?' : 'Xác nhận?'}
        body={confirm?.kind === 'payment' ? `Debt #${confirm.payload.debtId} — ${fmtVND(confirm.payload.amt)} qua ${confirm.payload.method}?` : confirm?.kind === 'remind' ? `Nhắc debt #${confirm.payload.id} (còn lại ${fmtVND(Number(confirm.payload.amount) - Number(confirm.payload.paid))})?` : ''}
        confirmLabel={confirm?.kind === 'payment' ? 'Ghi payment' : 'Gửi'}
        busy={m.busy} onCancel={() => setConfirm(null)}
        onConfirm={() => m.run(confirm.kind, confirm.payload).catch((e) => toast(e.message, 'err'))} />
    </>
  );
}
