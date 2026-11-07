import { api, fmtVND } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { DataTable, EmptyState, ErrorState, LoadingState, PageHeader, SectionCard, StatusBadge } from '../components/ui.jsx';

async function loadCeo() {
  const [kpi, fin, appr, alerts] = await Promise.all([
    api('/api/sales/kpi'),
    api('/api/finance/kpis'),
    api('/api/approvals'),
    api('/api/ops/alerts'),
  ]);
  return { kpi: kpi || {}, fin: fin || {}, appr: appr || [], alerts: alerts || [] };
}

export default function CeoTab({ toast }) {
  const { data, loading, error, reload } = useQuery(loadCeo, []);

  if (loading) return (<><PageHeader title="Tổng quan CEO" desc="KPI, phê duyệt tồn và cảnh báo vận hành từ API thật." /><LoadingState /></>);
  if (error) return (<><PageHeader title="Tổng quan CEO" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);

  const { kpi, fin, appr, alerts } = data;
  const pending = appr.filter((x) => x.status === 'pending');

  return (
    <>
      <PageHeader title="Tổng quan CEO" desc="Số liệu từ /sales/kpi và /finance/kpis. Không có so sánh tháng trước vì API chưa cung cấp."
        actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />
      <div className="kpis" role="list" aria-label="KPI chính">
        <div className="kpi" role="listitem"><small>Doanh thu 30 ngày</small><strong>{fmtVND(kpi.revenue30d)}</strong></div>
        <div className="kpi" role="listitem"><small>Đơn 30 ngày</small><strong>{kpi.orders30d ?? '—'}</strong></div>
        <div className="kpi" role="listitem"><small>Win-rate</small><strong>{kpi.win_rate != null ? kpi.win_rate + '%' : '—'}</strong></div>
        <div className="kpi" role="listitem"><small>Công nợ phải thu (AR)</small><strong>{fmtVND(fin.ar)}</strong></div>
        <div className="kpi" role="listitem"><small>DSO</small><strong>{fin.dso != null ? fin.dso + ' ngày' : '—'}</strong></div>
      </div>

      <SectionCard title="Phê duyệt đang chờ" desc="Từ /api/approvals — sang tab Legal để duyệt.">
        <DataTable caption="Danh sách phê duyệt pending"
          columns={[
            { key: 'id', head: 'ID' },
            { key: 'ref_type', head: 'Loại' },
            { key: 'ref_id', head: 'Ref' },
            { key: 'level', head: 'Level' },
            { key: 'status', head: 'Trạng thái', render: (a) => <StatusBadge value={a.status} /> },
          ]}
          rows={pending.slice(0, 20)} keyOf={(a) => a.id}
          empty={{ title: 'Không có phê duyệt tồn', hint: 'Mọi đề xuất đã được xử lý.' }} />
      </SectionCard>

      <SectionCard title="Cảnh báo vận hành" desc="Tồn kho thấp từ /api/ops/alerts.">
        {!alerts.length
          ? <EmptyState title="Kho ổn định" hint="Không có SKU nào dưới ngưỡng cảnh báo." />
          : (
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {alerts.slice(0, 10).map((p) => (
                <li key={p.sku}><StatusBadge value="tồn thấp" tone="err" /> <b>{p.sku}</b> tồn {p.stock} ({p.name})</li>
              ))}
            </ul>
          )}
      </SectionCard>
    </>
  );
}
