import { useState } from 'react';
import { api, fmtVND } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, StatusBadge, useMutation } from '../components/ui.jsx';

export default function HrTab({ toast }) {
  const { data: emps, loading, error, reload } = useQuery(async () => api('/api/employees'), []);
  const [code, setCode] = useState('');
  const [today, setToday] = useState(null);
  const [month, setMonth] = useState('');
  const [pay, setPay] = useState(null);
  const m = useMutation(async (kind, payload) => {
    if (kind === 'checkin') {
      const r = await api('/api/attendance/checkin', { method: 'POST', body: JSON.stringify({ employee_code: payload.trim() }) });
      toast('Checkin OK: ' + r.status, 'ok');
    } else if (kind === 'checkout') {
      await api('/api/attendance/checkout', { method: 'POST', body: JSON.stringify({ employee_code: payload.trim() }) });
      toast('Checkout OK', 'ok');
    } else if (kind === 'today') {
      setToday(await api('/api/hr/today'));
    } else if (kind === 'payroll') {
      setPay(await api('/api/hr/payroll-preview' + (payload.trim() ? '?month=' + encodeURIComponent(payload.trim()) : '')));
    }
  });

  function attend(kind) {
    if (!code.trim()) { toast('Nhập mã nhân viên', 'err'); return; }
    m.run(kind, code).catch((e) => toast(e.message, 'err'));
  }

  if (loading) return (<><PageHeader title="Nhân sự" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Nhân sự" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);

  return (
    <>
      <PageHeader title="Nhân sự" desc="Chấm công, danh sách nhân sự, payroll preview. Lương do backend lọc theo quyền — UI không suy đoán."
        actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />
      <SectionCard title="Chấm công" desc="POST /api/attendance/checkin|checkout. Mã NV phải khớp user đăng nhập (trừ hr/manager+ chấm hộ).">
        <div className="row">
          <FormField label="Mã nhân viên"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="employee_code (vd NV101)" autoComplete="off" /></FormField>
          <span className="btn-row">
            <button className="btn" disabled={m.busy} onClick={() => attend('checkin')}>Checkin</button>
            <button className="btn ghost" disabled={m.busy} onClick={() => attend('checkout')}>Checkout</button>
            <button className="btn ghost" disabled={m.busy} onClick={() => m.run('today').catch((e) => toast(e.message, 'err'))}>Hôm nay</button>
          </span>
        </div>
        {today && <DataTable columns={[{ key: 'employee_code', head: 'Mã' }, { key: 'name', head: 'Tên' }, { key: 'status', head: 'Status', render: (r) => <StatusBadge value={r.status} /> }]} rows={today.slice(0, 30)} keyOf={(r, i) => (r.employee_code || '') + i} empty={{ title: 'Hôm nay chưa có chấm công' }} />}
      </SectionCard>

      <SectionCard title="Nhân sự" desc="GET /api/employees — lương đã lọc backend (sales không thấy).">
        <DataTable
          columns={[
            { key: 'code', head: 'Mã' },
            { key: 'name', head: 'Tên' },
            { key: 'dept_code', head: 'Phòng' },
            { key: 'salary', head: 'Lương', render: (e) => e.salary_base != null ? fmtVND(e.salary_base) : '(ẩn theo quyền)' },
          ]}
          rows={(emps || []).slice(0, 30)} keyOf={(e) => e.code}
          empty={{ title: 'Chưa có nhân sự' }} />
      </SectionCard>

      <SectionCard title="Payroll preview" desc="GET /api/hr/payroll-preview — salary/26 × ngày present. Chỉ là preview, không phải bảng lương chính thức.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); m.run('payroll', month).catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Tháng" hint="Định dạng YYYY-MM, để trống = tháng hiện tại"><input className="input" value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Xem</button>
        </form>
        {pay && <DataTable columns={[{ key: 'code', head: 'Mã', render: (p) => p.employee_code || p.code }, { key: 'days', head: 'Ngày công', render: (p) => p.present_days ?? p.days ?? '' }, { key: 'pay', head: 'Lương', render: (p) => fmtVND(p.pay ?? p.amount) }]} rows={pay.slice(0, 30)} keyOf={(p, i) => (p.employee_code || p.code || '') + i} empty={{ title: 'Không có dữ liệu payroll tháng này' }} />}
      </SectionCard>
    </>
  );
}
