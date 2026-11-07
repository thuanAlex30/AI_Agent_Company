import { useState } from 'react';
import { api, fmtVND } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, useMutation } from '../components/ui.jsx';

export default function MarketingTab({ toast }) {
  const { data, loading, error, reload } = useQuery(async () => api('/api/marketing/roi'), []);
  const [name, setName] = useState('');
  const [ch, setCh] = useState('facebook');
  const [cost, setCost] = useState('');
  const m = useMutation(async () => {
    await api('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: name.trim(), channel: ch, cost: Number(cost) || 0 }) });
    toast('Đã tạo chiến dịch', 'ok'); setName(''); setCost(''); reload();
  });

  if (loading) return (<><PageHeader title="Marketing" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Marketing" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);

  return (
    <>
      <PageHeader title="Marketing" desc="Chiến dịch + ROI từ /api/marketing/roi. CPO cảnh báo khi >200k — không vẽ biểu đồ vì API chưa cung cấp chuỗi thời gian."
        actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />
      <SectionCard title="Tạo chiến dịch" desc="POST /api/campaigns.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) { toast('Nhập tên chiến dịch', 'err'); return; } m.run().catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Tên chiến dịch"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="tên chiến dịch" /></FormField>
          <FormField label="Kênh"><select className="input" value={ch} onChange={(e) => setCh(e.target.value)}><option value="facebook">facebook</option><option value="tiktok">tiktok</option><option value="zalo">zalo</option><option value="shopee">shopee</option><option value="offline">offline</option><option value="seo">seo</option></select></FormField>
          <FormField label="Cost (VND)"><input className="input" value={cost} onChange={(e) => setCost(e.target.value)} type="number" min="0" placeholder="cost" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>{m.busy ? 'Đang gửi…' : 'Tạo'}</button>
        </form>
      </SectionCard>
      <SectionCard title="ROI theo chiến dịch">
        <DataTable
          columns={[
            { key: 'name', head: 'Campaign' },
            { key: 'cost', head: 'Cost', render: (r) => fmtVND(r.cost) },
            { key: 'leads', head: 'Leads' },
            { key: 'orders', head: 'Orders' },
            { key: 'cpo', head: 'CPO', render: (r) => r.cpo != null ? fmtVND(r.cpo) + (r.cpo_alert ? ' (cao >200k!)' : '') : '—' },
          ]}
          rows={data || []} keyOf={(r, i) => (r.name || '') + i}
          empty={{ title: 'Chưa có chiến dịch', hint: 'Tạo chiến dịch đầu tiên bằng form phía trên.' }} />
      </SectionCard>
    </>
  );
}
