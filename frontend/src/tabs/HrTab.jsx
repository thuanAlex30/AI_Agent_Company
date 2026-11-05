import { useEffect, useState } from 'react';
import { api, fmtVND } from '../api.js';

export default function HrTab({ toast }) {
  const [code, setCode] = useState('');
  const [emps, setEmps] = useState([]);
  const [today, setToday] = useState([]);
  const [month, setMonth] = useState('');
  const [pay, setPay] = useState([]);
  async function loadEmp() { try { setEmps(await api('/api/employees')); } catch (e) { toast(e.message); } }
  useEffect(() => { loadEmp(); }, []);
  return (
    <>
      <div className="card"><h3>Chấm công (mã NV, chống chấm hộ)</h3>
        <div className="row"><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="employee_code (vd NV101)" />
        <button className="btn" onClick={async () => { try { const r = await api('/api/attendance/checkin', { method: 'POST', body: JSON.stringify({ employee_code: code.trim() }) }); toast('Checkin OK: ' + r.status); } catch (e) { toast(e.message); } }}>Checkin</button>
        <button className="btn" onClick={async () => { try { await api('/api/attendance/checkout', { method: 'POST', body: JSON.stringify({ employee_code: code.trim() }) }); toast('Checkout OK'); } catch (e) { toast(e.message); } }}>Checkout</button>
        <button className="btn ghost" onClick={async () => { try { setToday(await api('/api/hr/today')); } catch (e) { toast(e.message); } }}>Hôm nay</button></div>
        {!!today.length && <table><tbody><tr><th>Mã</th><th>Tên</th><th>Status</th></tr>{today.slice(0, 30).map((r, i) => <tr key={i}><td>{r.employee_code}</td><td>{r.name}</td><td>{r.status}</td></tr>)}</tbody></table>}
      </div>
      <div className="card"><h3>Nhân sự (lương đã lọc backend — sales không thấy)</h3>
        <table><tbody><tr><th>Mã</th><th>Tên</th><th>Phòng</th><th>Lương</th></tr>
        {emps.slice(0, 30).map((e) => <tr key={e.code}><td>{e.code}</td><td>{e.name}</td><td>{e.dept_code}</td><td>{e.salary_base != null ? fmtVND(e.salary_base) : '(ẩn)'}</td></tr>)}
        </tbody></table>
      </div>
      <div className="card"><h3>Payroll preview (salary/26 x ngày present)</h3>
        <div className="row"><input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" />
        <button className="btn" onClick={async () => { try { setPay(await api('/api/hr/payroll-preview' + (month.trim() ? '?month=' + encodeURIComponent(month.trim()) : ''))); } catch (e) { toast(e.message); } }}>Xem</button></div>
        {!!pay.length && <table><tbody><tr><th>Mã</th><th>Ngày công</th><th>Lương</th></tr>{pay.slice(0, 30).map((p, i) => <tr key={i}><td>{p.employee_code || p.code}</td><td>{p.present_days ?? p.days ?? ''}</td><td>{fmtVND(p.pay ?? p.amount)}</td></tr>)}</tbody></table>}
      </div>
    </>
  );
}
