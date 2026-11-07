import { useState } from 'react';
import { api } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, StatusBadge, useMutation } from '../components/ui.jsx';

async function loadLegal() {
  const [appr, risks, audit] = await Promise.all([api('/api/approvals'), api('/api/risks'), api('/api/audit')]);
  return { appr: appr || [], risks: risks || [], audit: audit || [] };
}

export default function LegalTab({ toast }) {
  const { data, loading, error, reload } = useQuery(loadLegal, []);
  const [rkTitle, setRkTitle] = useState('');
  const [rkLevel, setRkLevel] = useState('medium');
  const m = useMutation(async (kind, payload) => {
    if (kind === 'decide') {
      await api('/api/approvals/' + payload.id + '/decide', { method: 'POST', body: JSON.stringify({ decision: payload.decision }) });
      toast(payload.decision === 'approved' ? 'Đã duyệt #' + payload.id : 'Đã từ chối #' + payload.id, 'ok'); reload();
    } else {
      await api('/api/risks', { method: 'POST', body: JSON.stringify({ title: payload.title, level: payload.level }) });
      toast('Đã tạo risk', 'ok'); setRkTitle(''); reload();
    }
  });

  if (loading) return (<><PageHeader title="Pháp chế & Kiểm soát" /><LoadingState /></>);
  if (error) {
    const forbidden = error.status === 403;
    return (<><PageHeader title="Pháp chế & Kiểm soát" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} />
      <ErrorState error={error} onRetry={reload} />
      {forbidden && <p style={{ color: 'var(--ink-400)', fontSize: '.9rem' }}>Audit log chỉ dành cho cfo/ceo/legal/owner — 403 là đúng quyền, không phải lỗi hệ thống.</p>}</>);
  }
  const { appr, risks, audit } = data;
  const pending = appr.filter((x) => x.status === 'pending');

  return (
    <>
      <PageHeader title="Pháp chế & Kiểm soát" desc="Phê duyệt, rủi ro, audit log. Requester không tự duyệt — backend enforce." actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />
      <SectionCard title="Phê duyệt đang chờ" desc="POST /api/approvals/:id/decide — approved|rejected.">
        <DataTable
          columns={[
            { key: 'id', head: 'ID' },
            { key: 'ref_type', head: 'Loại' },
            { key: 'ref_id', head: 'Ref' },
            { key: 'level', head: 'Level' },
            { key: 'status', head: 'Status', render: (a) => <StatusBadge value={a.status} /> },
            { key: 'act', head: '', render: (a) => (<span className="btn-row">
              <button className="btn small" disabled={m.busy} onClick={() => m.run('decide', { id: a.id, decision: 'approved' }).catch((e) => toast(e.message, 'err'))}>Duyệt</button>
              <button className="btn small ghost" disabled={m.busy} onClick={() => m.run('decide', { id: a.id, decision: 'rejected' }).catch((e) => toast(e.message, 'err'))}>Từ chối</button>
            </span>) },
          ]}
          rows={pending.slice(0, 20)} keyOf={(a) => a.id}
          empty={{ title: 'Không có phê duyệt tồn' }} />
      </SectionCard>

      <SectionCard title="Rủi ro" desc="POST /api/risks.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!rkTitle.trim()) { toast('Nhập tiêu đề rủi ro', 'err'); return; } m.run('risk', { title: rkTitle.trim(), level: rkLevel }).catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Tiêu đề rủi ro"><input className="input" style={{ minWidth: 220 }} value={rkTitle} onChange={(e) => setRkTitle(e.target.value)} placeholder="tiêu đề rủi ro" /></FormField>
          <FormField label="Mức độ"><select className="input" value={rkLevel} onChange={(e) => setRkLevel(e.target.value)}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option></select></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Tạo</button>
        </form>
        <DataTable columns={[{ key: 'title', head: 'Title' }, { key: 'level', head: 'Level', render: (r) => <StatusBadge value={r.level} /> }, { key: 'status', head: 'Status', render: (r) => <StatusBadge value={r.status} /> }]}
          rows={risks.slice(0, 20)} keyOf={(r, i) => (r.id ?? '') + i} empty={{ title: 'Chưa có rủi ro' }} />
      </SectionCard>

      <SectionCard title="Audit log" desc="GET /api/audit — read-only, chỉ role được phép.">
        <DataTable columns={[{ key: 'actor', head: 'Actor' }, { key: 'action', head: 'Action' }, { key: 'table_name', head: 'Table' }, { key: 'record_id', head: 'Record' }]}
          rows={audit.slice(0, 20)} keyOf={(r, i) => i} empty={{ title: 'Chưa có audit log' }} />
      </SectionCard>
    </>
  );
}
