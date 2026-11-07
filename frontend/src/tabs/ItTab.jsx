import { useState } from 'react';
import { api } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, StatusBadge, useMutation } from '../components/ui.jsx';

async function loadIt() {
  const [health, rows] = await Promise.all([api('/api/it/health'), api('/api/it-incidents')]);
  return { health, rows: rows || [] };
}

export default function ItTab({ toast }) {
  const { data, loading, error, reload } = useQuery(loadIt, []);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [sev, setSev] = useState('p3');
  const m = useMutation(async (kind, payload) => {
    if (kind === 'create') {
      await api('/api/it-incidents', { method: 'POST', body: JSON.stringify({ code: payload.code, title: payload.title, severity: payload.sev }) });
      toast('Đã tạo incident', 'ok'); setCode(''); setTitle(''); reload();
    } else {
      await api('/api/it-incidents/' + payload.id, { method: 'PATCH', body: JSON.stringify({ status: payload.status }) });
      toast('Incident → ' + payload.status, 'ok'); reload();
    }
  });

  if (loading) return (<><PageHeader title="Công nghệ" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Công nghệ" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);
  const { health, rows } = data;

  return (
    <>
      <PageHeader title="Công nghệ" desc="Sức khỏe hệ thống và sự cố IT từ API thật." actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />
      <div className="kpis">
        <div className="kpi"><small>Incident mở</small><strong>{health?.open ?? '—'}</strong></div>
        <div className="kpi"><small>P1 đang mở</small><strong>{health?.p1_open ?? '—'}</strong></div>
        <div className="kpi"><small>MTTR</small><strong>{health?.mttr_min != null ? health.mttr_min + 'p' : '—'}</strong></div>
        <div className="kpi"><small>Uptime (ước tính)</small><strong>{health?.uptime_estimate != null ? health.uptime_estimate + '%' : '—'}</strong></div>
      </div>
      {health?.note && <p style={{ color: 'var(--ink-400)', fontSize: '.85rem' }}>{health.note} — uptime là ước tính từ API, không phải SLA cam kết.</p>}

      <SectionCard title="Tạo sự cố" desc="POST /api/it-incidents.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!code.trim() || !title.trim()) { toast('Nhập mã và tiêu đề', 'err'); return; } m.run('create', { code: code.trim(), title: title.trim(), sev }).catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Mã"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="mã (INC-...)" /></FormField>
          <FormField label="Tiêu đề"><input className="input" style={{ minWidth: 220 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="tiêu đề" /></FormField>
          <FormField label="Mức độ"><select className="input" value={sev} onChange={(e) => setSev(e.target.value)}><option value="p1">p1</option><option value="p2">p2</option><option value="p3">p3</option><option value="p4">p4</option></select></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Tạo</button>
        </form>
      </SectionCard>

      <SectionCard title="Sự cố">
        <DataTable
          columns={[
            { key: 'code', head: 'Code' },
            { key: 'title', head: 'Title' },
            { key: 'severity', head: 'Sev', render: (r) => <StatusBadge value={r.severity} /> },
            { key: 'status', head: 'Status', render: (r) => <StatusBadge value={r.status} /> },
            { key: 'act', head: '', render: (r) => (<span className="btn-row">
              <button className="btn small ghost" disabled={m.busy} onClick={() => m.run('patch', { id: r.id, status: 'fixing' }).catch((e2) => toast(e2.message, 'err'))}>Fixing</button>
              <button className="btn small ghost" disabled={m.busy} onClick={() => m.run('patch', { id: r.id, status: 'resolved' }).catch((e2) => toast(e2.message, 'err'))}>Resolve</button>
            </span>) },
          ]}
          rows={rows.slice(0, 20)} keyOf={(r) => r.id}
          empty={{ title: 'Không có sự cố', hint: 'Hệ thống đang hoạt động ổn định.' }} />
      </SectionCard>
    </>
  );
}
