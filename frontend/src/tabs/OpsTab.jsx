import { useState } from 'react';
import { api, fmtVND, uuid } from '../api.js';
import { useQuery } from '../hooks/useApi.js';
import { ConfirmDialog, DataTable, ErrorState, FormField, LoadingState, PageHeader, SectionCard, StatusBadge, useMutation } from '../components/ui.jsx';

async function loadOps() {
  const [stock, ships, pos] = await Promise.all([api('/api/products'), api('/api/shipments'), api('/api/purchase-orders')]);
  return { stock: stock || [], ships: ships || [], pos: pos || [] };
}

export default function OpsTab({ toast }) {
  const { data, loading, error, reload } = useQuery(loadOps, []);
  const [sku, setSku] = useState('CF-SUA-01');
  const [qty, setQty] = useState(10);
  const [poCode, setPoCode] = useState('');
  const [poAmt, setPoAmt] = useState('');
  const [confirm, setConfirm] = useState(null);
  const m = useMutation(async (kind, payload) => {
    if (kind === 'in') {
      await api('/api/stock/in', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ sku: payload.sku, qty: Number(payload.qty) }) });
      toast('Đã nhập kho ' + payload.sku, 'ok');
    } else if (kind === 'out') {
      await api('/api/stock/out', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ sku: payload.sku, qty: Number(payload.qty) }) });
      toast('Đã xuất kho ' + payload.sku, 'ok');
    } else if (kind === 'ship') {
      await api('/api/shipments/' + payload.id, { method: 'PATCH', body: JSON.stringify({ status: payload.next }) });
      toast('Vận đơn → ' + payload.next, 'ok');
    } else if (kind === 'po') {
      await api('/api/purchase-orders', { method: 'POST', headers: { 'Idempotency-Key': uuid() }, body: JSON.stringify({ code: payload.code, amount: Number(payload.amt) }) });
      toast('Đã tạo PO ' + payload.code, 'ok'); setPoCode(''); setPoAmt('');
    } else if (kind === 'receive') {
      await api('/api/purchase-orders/' + payload.id + '/receive', { method: 'POST', body: JSON.stringify({ items: [] }) });
      toast('Đã receive ' + payload.code, 'ok');
    }
    setConfirm(null);
    reload();
  });

  if (loading) return (<><PageHeader title="Kho & Vận hành" /><LoadingState /></>);
  if (error) return (<><PageHeader title="Kho & Vận hành" actions={<button className="btn small ghost" onClick={reload}>Thử lại</button>} /><ErrorState error={error} onRetry={reload} /></>);
  const { stock, ships, pos } = data;
  const low = stock.filter((p) => Number(p.stock) <= Number(p.stock_alert));

  return (
    <>
      <PageHeader title="Kho & Vận hành" desc="Tồn kho, nhập/xuất, vận đơn, PO. Tồn kho do backend tính — UI không ước lượng."
        actions={<button className="btn small ghost" onClick={reload}>Tải lại</button>} />
      {!!low.length && <div className="alert warn" role="status"><strong>Cảnh báo tồn thấp:</strong>&nbsp;{low.slice(0, 8).map((p) => p.sku).join(', ')}{low.length > 8 ? ` (+${low.length - 8})` : ''}</div>}

      <SectionCard title="Tồn kho" desc="Từ /api/products.">
        <DataTable caption="Tồn kho hiện tại"
          columns={[
            { key: 'sku', head: 'SKU' },
            { key: 'name', head: 'Tên' },
            { key: 'stock', head: 'Tồn', render: (p) => Number(p.stock) <= Number(p.stock_alert) ? <span><StatusBadge value={'tồn ' + p.stock} tone="err" /></span> : p.stock },
            { key: 'alert', head: 'Ngưỡng', render: (p) => p.stock_alert },
          ]}
          rows={stock} keyOf={(p) => p.sku}
          empty={{ title: 'Chưa có sản phẩm', hint: 'Kho liên hệ IT nếu API trống bất thường.' }} />
      </SectionCard>

      <SectionCard title="Nhập / Xuất kho" desc="POST /api/stock/in|out. Xác nhận SKU + số lượng + loại giao dịch trước khi gửi.">
        <form className="row" onSubmit={(e) => e.preventDefault()}>
          <FormField label="SKU"><input className="input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" /></FormField>
          <FormField label="Số lượng"><input className="input" value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="1" /></FormField>
          <span className="btn-row">
            <button className="btn" disabled={m.busy || !sku.trim()} onClick={() => setConfirm({ kind: 'in', payload: { sku: sku.trim(), qty } })}>Nhập kho</button>
            <button className="btn ghost" disabled={m.busy || !sku.trim()} onClick={() => setConfirm({ kind: 'out', payload: { sku: sku.trim(), qty } })}>Xuất kho</button>
          </span>
        </form>
      </SectionCard>

      <SectionCard title="Vận đơn" desc="PATCH /api/shipments/:id — chỉ chuyển pending→shipping→done theo state machine backend.">
        <DataTable
          columns={[
            { key: 'id', head: 'ID' },
            { key: 'order_id', head: 'Đơn' },
            { key: 'status', head: 'Status', render: (s) => <StatusBadge value={s.status} /> },
            { key: 'act', head: '', render: (s) => {
              const next = s.status === 'pending' ? 'shipping' : s.status === 'shipping' ? 'done' : null;
              return next ? <button className="btn small ghost" disabled={m.busy} onClick={() => setConfirm({ kind: 'ship', payload: { ...s, next } })}>→ {next}</button> : '—';
            } },
          ]}
          rows={ships.slice(0, 20)} keyOf={(s) => s.id}
          empty={{ title: 'Chưa có vận đơn', hint: 'Đơn mới tạo sẽ sinh shipment tại đây.' }} />
      </SectionCard>

      <SectionCard title="PO + Receive" desc="POST /api/purchase-orders, POST /:id/receive.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!poCode.trim()) { toast('Nhập mã PO', 'err'); return; } setConfirm({ kind: 'po', payload: { code: poCode.trim(), amt: poAmt } }); }}>
          <FormField label="Mã PO"><input className="input" value={poCode} onChange={(e) => setPoCode(e.target.value)} placeholder="mã PO" /></FormField>
          <FormField label="Amount"><input className="input" value={poAmt} onChange={(e) => setPoAmt(e.target.value)} type="number" min="0" placeholder="amount" /></FormField>
          <button className="btn" type="submit" disabled={m.busy}>Tạo PO</button>
        </form>
        <DataTable
          columns={[
            { key: 'code', head: 'Code' },
            { key: 'amount', head: 'Amount', render: (p) => fmtVND(p.amount) },
            { key: 'status', head: 'Status', render: (p) => <StatusBadge value={p.status} /> },
            { key: 'act', head: '', render: (p) => <button className="btn small ghost" disabled={m.busy} onClick={() => setConfirm({ kind: 'receive', payload: p })}>Receive</button> },
          ]}
          rows={pos.slice(0, 20)} keyOf={(p) => p.id}
          empty={{ title: 'Chưa có PO', hint: 'Tạo PO đầu tiên bằng form phía trên.' }} />
      </SectionCard>

      <ConfirmDialog open={!!confirm}
        title={confirm?.kind === 'in' ? 'Xác nhận nhập kho?' : confirm?.kind === 'out' ? 'Xác nhận xuất kho?' : confirm?.kind === 'ship' ? 'Chuyển trạng thái vận đơn?' : confirm?.kind === 'po' ? 'Xác nhận tạo PO?' : 'Xác nhận receive PO?'}
        body={confirm?.kind === 'in' || confirm?.kind === 'out' ? `${confirm?.kind === 'in' ? 'Nhập' : 'Xuất'} ${confirm?.payload.qty} × ${confirm?.payload.sku}?` : confirm?.kind === 'ship' ? `Vận đơn #${confirm?.payload.id} → ${confirm?.payload.next}?` : confirm?.kind === 'po' ? `Tạo PO ${confirm?.payload.code} — ${fmtVND(confirm?.payload.amt || 0)}?` : `Receive PO ${confirm?.payload.code}? Tồn kho sẽ tăng theo items backend trả về.`}
        confirmLabel="Xác nhận" busy={m.busy} onCancel={() => setConfirm(null)}
        onConfirm={() => m.run(confirm.kind, confirm.payload).catch((e) => toast(e.message, 'err'))} />
    </>
  );
}
