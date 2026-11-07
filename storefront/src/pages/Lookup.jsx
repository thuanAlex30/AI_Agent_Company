import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lookupByToken, lookupOrder } from '../services/api.js';
import { fmtVND } from '../utils/format.js';
import Field, { Input } from '../components/ui/Field.jsx';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import Icon from '../components/ui/Icon.jsx';
import { ErrorState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

const STEPS = [
  { key: 'received', label: 'Đã đặt' },
  { key: 'approved', label: 'Đã xác nhận' },
  { key: 'making', label: 'Đang chuẩn bị' },
  { key: 'shipping', label: 'Đang giao' },
  { key: 'done', label: 'Hoàn tất' },
];

const STATUS_VN = {
  pending: 'Chờ duyệt', pending_approval: 'Chờ duyệt', approved: 'Đã duyệt',
  in_progress: 'Đang làm', paid: 'Đã thanh toán', partial: 'Thanh toán 1 phần',
  done: 'Hoàn tất', cancelled: 'Đã hủy', refunded: 'Đã hoàn tiền',
};

export default function Lookup({ toast }) {
  const [sp] = useSearchParams();
  const [code, setCode] = useState(sp.get('code') || '');
  const [contact, setContact] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);

  usePageMeta('Tra cứu đơn (demo F&B)', 'Tra cứu đơn demo bằng mã đơn và SĐT/email — bảo mật 2 yếu tố.');

  // Token tra cuu chi doc tu sessionStorage (khong nam trong URL)
  useEffect(() => {
    const c = sp.get('code');
    if (!c) return;
    setCode(c);
    let tok = '';
    try { tok = sessionStorage.getItem('bizops-lookup:' + c) || ''; } catch {}
    if (!tok) return;
    setBusy(true);
    lookupByToken(c, tok)
      .then(setData)
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [sp]);

  async function submit(e) {
    e && e.preventDefault();
    if (!code.trim() || !contact.trim()) {
      toast && toast('Nhập đủ mã đơn + SĐT/email');
      return;
    }
    setBusy(true); setData(null); setNotFound(false);
    try {
      setData(await lookupOrder(code.trim(), contact.trim()));
    } catch (ex) {
      // Khong tiet lo don ton tai hay khong — thong bao chung
      setNotFound(true);
      toast && toast('Không tìm thấy đơn (kiểm tra mã + SĐT/email)');
    } finally {
      setBusy(false);
    }
  }

  const cur = data?.timeline?.current;
  const curIdx = STEPS.findIndex((s) => s.key === cur);

  return (
    <>
      <div className="sechd">
        <h1 className="page-h1">Tra cứu đơn</h1>
        <span style={{ color: 'var(--ink-400)' }}>Bảo mật 2 yếu tố</span>
      </div>

      <form className="card form" onSubmit={submit}>
        <Field label="Mã đơn" required hint="Ví dụ: DHW-2026-000123">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DHW-…" autoComplete="off" />
        </Field>
        <Field label="SĐT hoặc email đã đặt" required hint="Phải khớp với thông tin trong đơn">
          <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="09xxxxxxxx hoặc email" autoComplete="off" />
        </Field>
        <Button type="submit" loading={busy} disabled={busy} icon="search">
          {busy ? 'Đang tra cứu…' : 'Tra cứu'}
        </Button>
        <small style={{ color: 'var(--ink-400)' }}>
          Sai 1 trong 2 yếu tố đều trả “không tìm thấy” — không tiết lộ đơn có tồn tại hay không.
        </small>
      </form>

      {notFound && !data ? (
        <ErrorState
          title="Không tìm thấy đơn"
          description="Kiểm tra lại mã đơn và SĐT/email đã dùng khi đặt."
          onRetry={() => setNotFound(false)}
          retryLabel="Tra cứu lại"
        />
      ) : null}

      {data ? (
        <div className="card" style={{ marginTop: 'var(--s-4)' }}>
          {/* heading-order (WCAG): trang co <h1> nen tieu de don phai la <h2> */}
          <h2 className="ck-h" style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', flexWrap: 'wrap' }}>
            {data.code}
            <Badge tone={data.status === 'done' ? 'ok' : data.status === 'cancelled' ? 'err' : 'info'}>
              {STATUS_VN[data.status] || data.status}
            </Badge>
          </h2>
          <p>
            Tổng <strong>{fmtVND(data.amount)}</strong> · đã trả <strong>{fmtVND(data.paid)}</strong>
            {' '}· còn <strong>{fmtVND(data.remain)}</strong>
            {data.order_date ? <> · đặt ngày {data.order_date}</> : null}
          </p>

          {data.remain > 0 ? (
            <div className="alert">
              Còn {fmtVND(data.remain)} — VietQR nội dung = {data.code} để webhook tự gạch nợ.
            </div>
          ) : (
            <div className="alert ok">Đã thanh toán đủ. Đơn đi làm/giao ngay.</div>
          )}

          {data.timeline?.cancelled ? (
            <div className="alert">Đơn {STATUS_VN[data.timeline.current] || data.timeline.current}.</div>
          ) : (
            <div className="timeline" role="list">
              {STEPS.map((s, i) => (
                <div key={s.key} role="listitem" className={i <= curIdx ? 'step done' : 'step'}>
                  <div className="dot">{i <= curIdx ? <Icon name="check" size={14} /> : i + 1}</div>
                  {s.label}
                </div>
              ))}
            </div>
          )}

          {data.shipment ? (
            <p>Vận chuyển: {data.shipment.carrier || 'shop tự giao'} · {data.shipment.status} · phí {fmtVND(data.shipment.ship_fee)}</p>
          ) : null}

          <Link className="ui-btn btn-ghost" to="/ho-tro">Cần hỗ trợ đơn này?</Link>
        </div>
      ) : null}
    </>
  );
}
