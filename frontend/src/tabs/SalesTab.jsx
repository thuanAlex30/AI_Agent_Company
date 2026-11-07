import { useState } from 'react';
import { api, fmtVND, uuid } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { ConfirmDialog, DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, StatusBadge, useMutation } from '../components/ui.jsx';

async function loadSales() {
  const [leads, orders] = await Promise.all([api('/api/leads'), api('/api/orders')]);
  return { leads: leads || [], orders: orders || [] };
}

export default function SalesTab({ toast }) {
  const { data, loading, error, reload } = useQuery(loadSales, []);
  const [ln, setLn] = useState('');
  const [lp, setLp] = useState('');
  const [code, setCode] = useState('');
  const [cust, setCust] = useState('');
  const [sku, setSku] = useState('CF-SUA-01');
  const [qty, setQty] = useState(2);
  const [confirm, setConfirm] = useState(null); // {kind, payload}
  const m = useMutation(async (kind, payload) => {
    if (kind === 'lead') {
      await api('/api/leads', { method: 'POST', body: JSON.stringify({ name: payload.name, phone: payload.phone }) });
      toast('Đã thêm lead', 'ok');
    } else if (kind === 'convert') {
      const r = await api('/api/leads/' + payload.id + '/convert', { method: 'POST' });
      toast('Convert OK → customer ' + r.customer_id, 'ok');
    } else if (kind === 'order') {
      await api('/api/orders', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ code: payload.code, customer_id: Number(payload.cust), items: [{ sku: payload.sku, qty: Number(payload.qty) }] }) });
      toast('Đã tạo đơn ' + payload.code, 'ok');
    } else if (kind === 'cancel') {
      await api('/api/orders/' + payload.id + '/cancel', { method: 'POST' });
      toast('Đã hủy ' + payload.code, 'ok');
    } else if (kind === 'refund') {
      await api('/api/orders/' + payload.id + '/refund', { method: 'POST' });
      toast('Đã hoàn ' + payload.code, 'ok');
    }
    setConfirm(null);
    reload();
  });

  if (loading) return (<><PageHeader title="Kinh doanh" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Kinh doanh" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);
  const { leads, orders } = data;

  return (
    <>
      <PageHeader title="Kinh doanh" desc="Lead → đơn. Tạo đơn trừ kho + sinh receivable + shipment (backend xử lý transaction)."
        actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />

      <SectionCard title="Leads" desc="Từ /api/leads. Convert tạo customer, không gửi employee ID tùy ý.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!ln.trim()) { toast('Nhập tên khách hàng', 'err'); return; } m.run('lead', { name: ln.trim(), phone: lp.trim() }).then(() => { setLn(''); setLp(''); }).catch((e2) => toast(e2.message, 'err')); }}>
          <FormField label="Tên KH"><input id="lead-name" className="input" value={ln} onChange={(e) => setLn(e.target.value)} placeholder="tên KH" autoComplete="off" /></FormField>
          <FormField label="SĐT"><input id="lead-phone" className="input" value={lp} onChange={(e) => setLp(e.target.value)} placeholder="sđt" inputMode="tel" autoComplete="off" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>{m.busy ? 'Đang gửi…' : 'Thêm lead'}</button>
        </form>
        <DataTable caption="30 lead gần nhất"
          columns={[
            { key: 'id', head: 'ID' },
            { key: 'name', head: 'Tên' },
            { key: 'phone', head: 'SĐT' },
            { key: 'stage', head: 'Stage', render: (l) => <StatusBadge value={l.stage} /> },
            { key: 'act', head: 'Thao tác', render: (l) => (l.stage !== 'won' && l.stage !== 'lost')
              ? <button className="btn small" disabled={m.busy} onClick={() => setConfirm({ kind: 'convert', payload: { id: l.id, name: l.name } })}>Convert</button> : '—' },
          ]}
          rows={leads.slice(0, 30)} keyOf={(l) => l.id}
          empty={{ title: 'Chưa có lead', hint: 'Thêm lead đầu tiên bằng form phía trên.' }} />
      </SectionCard>

      <SectionCard title="Tạo đơn" desc="POST /api/orders — trừ kho nguyên tử, sinh receivable + shipment. Mỗi lần bấm dùng Idempotency-Key mới; không retry tự động.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!code.trim() || !cust) { toast('Nhập mã đơn và customer_id', 'err'); return; } setConfirm({ kind: 'order', payload: { code: code.trim(), cust, sku: sku.trim(), qty } }); }}>
          <FormField label="Mã đơn"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="mã đơn (vd DH101)" /></FormField>
          <FormField label="Customer ID"><input className="input" value={cust} onChange={(e) => setCust(e.target.value)} placeholder="customer_id" type="number" min="1" /></FormField>
          <FormField label="SKU"><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" /></FormField>
          <FormField label="Số lượng"><input className="input" value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Tạo đơn</button>
        </form>
        <DataTable caption="30 đơn gần nhất"
          columns={[
            { key: 'code', head: 'Code' },
            { key: 'amount', head: 'Amount', render: (o) => fmtVND(o.amount) },
            { key: 'status', head: 'Status', render: (o) => <StatusBadge value={o.status} /> },
            { key: 'act', head: 'Thao tác', render: (o) => (<span className="btn-row">
              <button className="btn small ghost" disabled={m.busy} onClick={() => setConfirm({ kind: 'cancel', payload: o })}>Hủy</button>
              <button className="btn small ghost" disabled={m.busy} onClick={() => setConfirm({ kind: 'refund', payload: o })}>Hoàn</button>
            </span>) },
          ]}
          rows={orders.slice(0, 30)} keyOf={(o) => o.id}
          empty={{ title: 'Chưa có đơn hàng', hint: 'Tạo đơn đầu tiên bằng form phía trên.' }} />
      </SectionCard>

      <ConfirmDialog open={!!confirm} title={confirm?.kind === 'convert' ? 'Convert lead?' : confirm?.kind === 'order' ? 'Xác nhận tạo đơn?' : confirm?.kind === 'cancel' ? 'Xác nhận hủy đơn?' : 'Xác nhận hoàn đơn?'}
        body={confirm?.kind === 'convert' ? `Convert lead "${confirm.payload.name}" thành customer?` : confirm?.kind === 'order' ? `Tạo đơn ${confirm.payload.code} — KH ${confirm.payload.cust}, ${confirm.payload.sku} × ${confirm.payload.qty}?` : `Đơn ${confirm?.payload.code}: ${confirm?.kind === 'cancel' ? 'hủy (đơn đã có payment phải Hoàn thay vì Hủy)' : 'hoàn tiền'}?`}
        confirmLabel={confirm?.kind === 'convert' ? 'Convert' : confirm?.kind === 'order' ? 'Tạo đơn' : confirm?.kind === 'cancel' ? 'Hủy đơn' : 'Hoàn đơn'}
        busy={m.busy} onCancel={() => setConfirm(null)}
        onConfirm={() => m.run(confirm.kind, confirm.payload).catch((e2) => toast(e2.message, 'err'))} />
    </>
  );
}
