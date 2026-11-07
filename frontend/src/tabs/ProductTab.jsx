import { useState } from 'react';
import { api } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { EmptyState, ErrorState, FormField, LoadingState, PageHeader, SectionCard, useMutation } from '../components/ui.jsx';

const STAGES = ['idea', 'spec', 'building', 'testing', 'released'];

export default function ProductTab({ toast }) {
  const { data, loading, error, reload } = useQuery(async () => api('/api/product-features'), []);
  const [title, setTitle] = useState('');
  const m = useMutation(async () => {
    await api('/api/product-features', { method: 'POST', body: JSON.stringify({ title: title.trim() }) });
    toast('Đã tạo feature', 'ok'); setTitle(''); reload();
  });

  if (loading) return (<><PageHeader title="Sản phẩm" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Sản phẩm" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);
  const rows = data || [];

  return (
    <>
      <PageHeader title="Sản phẩm" desc="Kanban tính năng theo stage backend trả về (idea→released). UI không tự chuyển stage vì API hiện chỉ hỗ trợ tạo." actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />
      <SectionCard title="Tạo tính năng" desc="POST /api/product-features.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) { toast('Nhập tên tính năng', 'err'); return; } m.run().catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Tên tính năng"><input className="input" style={{ minWidth: 220 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="tên tính năng" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>{m.busy ? 'Đang gửi…' : 'Tạo'}</button>
        </form>
      </SectionCard>
      {!rows.length
        ? <EmptyState title="Chưa có tính năng" hint="Tạo feature đầu tiên bằng form phía trên." />
        : (<div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {STAGES.map((s) => (
            <div className="kpi" key={s} aria-label={'Cột ' + s}>
              <small>{s} ({rows.filter((x) => x.stage === s).length})</small>
              {rows.filter((x) => x.stage === s).slice(0, 10).map((r, i) => <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: '.9rem' }}>{r.title}</div>)}
              {!rows.some((x) => x.stage === s) && <div style={{ color: 'var(--ink-400)', fontSize: '.85rem' }}>—</div>}
            </div>
          ))}
        </div>)}
      <p style={{ color: 'var(--ink-400)', fontSize: '.85rem' }}>Giới hạn backend: API hiện chỉ hỗ trợ tạo và liệt kê feature; chuyển stage chưa có endpoint nên UI không dựng nút chuyển state giả.</p>
    </>
  );
}
