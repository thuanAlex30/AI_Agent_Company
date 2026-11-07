import { useState } from 'react';
import { api } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, StatusBadge, useMutation } from '../components/ui.jsx';

export default function QaTab({ toast }) {
  const { data, loading, error, reload } = useQuery(async () => api('/api/qa-checks'), []);
  const [type, setType] = useState('order');
  const [ref, setRef] = useState('');
  const [res, setRes] = useState('pass');
  const [defect, setDefect] = useState('');
  const m = useMutation(async () => {
    await api('/api/qa-checks', { method: 'POST', body: JSON.stringify({ ref_type: type, ref_id: Number(ref), result: res, defect: defect.trim() || null }) });
    toast('Đã ghi QA', 'ok'); setRef(''); setDefect(''); reload();
  });

  if (loading) return (<><PageHeader title="Chất lượng" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Chất lượng" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);

  const rows = data || [];
  const t = rows.length, f = rows.filter((r) => r.result === 'fail').length;
  const passPct = t ? Math.round((t - f) / t * 1000) / 10 : 100;
  const rep = rows.filter((r) => r.repeat_of != null).length;

  return (
    <>
      <PageHeader title="Chất lượng" desc="Ghi nhận pass/fail theo ref_type backend hỗ trợ (order|shipment|product). Không chuyển state tùy ý ngoài result." actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />
      <div className="kpis">
        <div className="kpi"><small>Pass rate (dữ liệu thật)</small><strong>{passPct}%</strong></div>
        <div className="kpi"><small>Pass / Tổng</small><strong>{t - f}/{t}</strong></div>
        <div className="kpi"><small>Repeat</small><strong>{rep}</strong></div>
      </div>
      <SectionCard title="Ghi kiểm tra" desc="POST /api/qa-checks. Fail nên nhập defect.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!ref) { toast('Nhập ref_id', 'err'); return; } if (res === 'fail' && !defect.trim()) { toast('Fail cần nhập defect', 'err'); return; } m.run().catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Loại ref"><select className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="order">order</option><option value="shipment">shipment</option><option value="product">product</option></select></FormField>
          <FormField label="Ref ID"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} type="number" min="1" placeholder="ref_id" /></FormField>
          <FormField label="Kết quả"><select className="input" value={res} onChange={(e) => setRes(e.target.value)}><option value="pass">pass</option><option value="fail">fail</option></select></FormField>
          <FormField label="Defect (nếu fail)"><input className="input" value={defect} onChange={(e) => setDefect(e.target.value)} placeholder="defect (nếu fail)" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>{m.busy ? 'Đang gửi…' : 'Ghi'}</button>
        </form>
      </SectionCard>
      <SectionCard title="Lịch sử kiểm tra">
        <DataTable columns={[{ key: 'ref', head: 'Ref', render: (r) => r.ref_type + '#' + r.ref_id }, { key: 'result', head: 'Result', render: (r) => <StatusBadge value={r.result} /> }, { key: 'defect', head: 'Defect', render: (r) => r.defect || '—' }, { key: 'repeat_of', head: 'Repeat_of', render: (r) => r.repeat_of ?? '—' }]}
          rows={rows.slice(0, 20)} keyOf={(r, i) => (r.id ?? '') + i} empty={{ title: 'Chưa có kiểm tra QA' }} />
      </SectionCard>
    </>
  );
}
