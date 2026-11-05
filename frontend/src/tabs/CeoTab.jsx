import { useEffect, useState } from 'react';
import { api, fmtVND } from '../api.js';

export default function CeoTab({ toast }) {
  const [sum, setSum] = useState('Đang tải...');
  const [appr, setAppr] = useState([]);
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const [kpi, fin, a, al] = await Promise.all([
          api('/api/sales/kpi').catch(() => null),
          api('/api/finance/kpis').catch(() => null),
          api('/api/approvals').catch(() => []),
          api('/api/ops/alerts').catch(() => []),
        ]);
        setSum(`Doanh thu 30d: ${fmtVND(kpi?.revenue30d)} | Đơn 30d: ${kpi?.orders30d ?? '-'} | Win-rate: ${kpi?.win_rate ?? '-'}% | AR: ${fmtVND(fin?.ar)} | DSO: ${fin?.dso ?? '-'} ngày`);
        setAppr((a || []).filter((x) => x.status === 'pending'));
        setAlerts(al || []);
      } catch (e) { toast('CEO lỗi: ' + e.message); }
    })();
  }, []);
  return (
    <>
      <div className="card"><h3>Tổng quan CEO</h3><p>{sum}</p></div>
      <div className="card"><h3>Phê duyệt tồn</h3>{!appr.length ? 'Không có phê duyệt tồn.' : (
        <table><tbody><tr><th>ID</th><th>Loại</th><th>Ref</th><th>Level</th><th>Trạng thái</th></tr>
        {appr.slice(0, 20).map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.ref_type}</td><td>{a.ref_id}</td><td>{a.level}</td><td>[CẦN-DUYỆT] pending</td></tr>)}
        </tbody></table>)}
      </div>
      <div className="card"><h3>Cảnh báo kho</h3>{!alerts.length ? 'Kho ổn định.' : (
        <ul>{alerts.slice(0, 10).map((p) => <li key={p.sku}><b className="stock-low">{p.sku} tồn {p.stock}</b> ({p.name})</li>)}</ul>)}
      </div>
    </>
  );
}
