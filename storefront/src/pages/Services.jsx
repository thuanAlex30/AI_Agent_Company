import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getServices, postServiceReq } from '../services/api.js';
import Button from '../components/ui/Button.jsx';
import Field, { Input, Select, Textarea } from '../components/ui/Field.jsx';
import Badge from '../components/ui/Badge.jsx';
import Icon from '../components/ui/Icon.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';
import { fmtNumber } from '../utils/format.js';

const PHONE_RE = /^0\d{9,10}$/;
const MST_RE = /^\d{10}(-\d{3})?$/;

// Khung gio (chip) — chi kiem tra o client, server van la nguon quyet dinh
const SLOTS = ['08:00', '09:30', '11:00', '13:30', '15:00', '16:30'];

export default function Services({ toast }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [f, setF] = useState({
    service_id: '', name: '', phone: '', email: '', slot_date: '', slot_time: '',
    party_size: 30, location: '', tax_code: '', note: '',
  });
  const [ferr, setFerr] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  usePageMeta('Dịch vụ (demo F&B)', 'Gói dịch vụ mẫu trong khu demo F&B — dữ liệu minh họa.');

  useEffect(() => {
    setItems(null); setErr('');
    getServices()
      .then((d) => {
        const arr = Array.isArray(d) ? d : d.items || [];
        setItems(arr);
        setF((v) => (v.service_id || !arr.length ? v : { ...v, service_id: arr[0].code }));
      })
      .catch((e) => setErr(e.message));
  }, [reloadKey]);

  function validate() {
    const e = {};
    if (!f.service_id) e.service_id = 'Chọn dịch vụ';
    if (!f.name.trim()) e.name = 'Nhập tên người đặt';
    if (!PHONE_RE.test(f.phone.trim())) e.phone = 'SĐT VN 09xxxxxxxx';
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Email chưa đúng';
    if (f.slot_date && f.slot_time) {
      const t = new Date(f.slot_date + 'T' + f.slot_time);
      if (isNaN(t.getTime()) || t.getTime() <= Date.now()) e.slot_time = 'Giờ phải trong tương lai';
    }
    const ps = Number(f.party_size);
    if (!Number.isInteger(ps) || ps < 1 || ps > 1000) e.party_size = 'Số người 1–1000';
    if (f.tax_code.trim() && !MST_RE.test(f.tax_code.trim())) e.tax_code = 'MST 10 hoặc 13 số';
    setFerr(e);
    return Object.keys(e).length === 0;
  }

  async function submit(ev) {
    ev.preventDefault();
    setDone(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const slot = f.slot_date && f.slot_time ? `${f.slot_date} ${f.slot_time}` : '';
      const d = await postServiceReq({
        ...f,
        slot_time: slot,
        name: f.name.trim(),
        phone: f.phone.trim(),
        party_size: Number(f.party_size) || undefined,
      });
      setDone(d);
      toast && toast('Đã nhận yêu cầu ' + d.code);
    } catch (ex) {
      toast && toast('Lỗi: ' + ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="crumb"><Link to="/">BizOps AI</Link> / <Link to="/demo-fb">Demo F&B</Link> / Dịch vụ (minh họa)</p>

      <div className="sechd">
        <h1 className="page-h1">Dịch vụ teabreak văn phòng</h1>
        <span style={{ color: 'var(--ink-400)' }}>Báo giá trong 24h · VAT 2 ngày</span>
      </div>

      {err ? (
        <ErrorState title="Không tải được danh sách dịch vụ" description={err} onRetry={() => setReloadKey((k) => k + 1)} />
      ) : null}

      <div className="grid g3">
        {!items && !err ? [1, 2, 3].map((i) => (
          <div className="card" key={i}>
            <Skeleton h={20} w="60%" />
            <Skeleton h={14} style={{ marginTop: 10 }} />
            <Skeleton h={40} style={{ marginTop: 10 }} />
          </div>
        )) : null}

        {(items || []).map((s) => (
          <article className="card" key={s.code || s.id}>
            {/* heading-order (WCAG): trang co <h1> nen tieu de the goi phai la <h2> */}
            <h2 className="ck-h">{s.name}</h2>
            <p style={{ color: 'var(--ink-400)' }}>{s.description || ''}</p>
            <div className="row">
              <Badge tone="brand">{s.code}</Badge>
              {s.price ? <span className="price">{fmtNumber(s.price)}đ/{s.unit || 'gói'}</span> : null}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setF((v) => ({ ...v, service_id: s.code }));
                document.getElementById('bookform')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Chọn gói này
            </Button>
          </article>
        ))}

        {items && items.length === 0 ? (
          <EmptyState icon="gift" title="Chưa có gói dịch vụ" description="Teabreak 30–1000 người · setup tận nơi · xuất VAT." />
        ) : null}
      </div>

      <h2 id="bookform" className="section-h2" style={{ marginTop: 'var(--s-6)' }}>Đặt lịch / báo giá teabreak</h2>

      <form className="card form" onSubmit={submit} noValidate>
        <Field label="Tên người đặt" required error={ferr.name}>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoComplete="name" />
        </Field>

        <Field label="SĐT" required error={ferr.phone}>
          <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="09xxxxxxxx" inputMode="tel" autoComplete="tel" />
        </Field>

        <Field label="Email" error={ferr.email} hint="Nhận báo giá qua mail">
          <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" autoComplete="email" />
        </Field>

        <Field label="Dịch vụ" required error={ferr.service_id}>
          <Select value={f.service_id} onChange={(e) => setF({ ...f, service_id: e.target.value })}>
            {(items || []).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </Select>
        </Field>

        <Field label="Ngày tổ chức" error={ferr.slot_time}>
          <Input
            type="date"
            value={f.slot_date}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setF({ ...f, slot_date: e.target.value })}
          />
        </Field>

        <Field label="Khung giờ" hint="Chọn khung giờ mong muốn — server sẽ xác nhận lại">
          <div className="chip-row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Khung giờ">
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                className={'chip' + (f.slot_time === s ? ' is-active' : '')}
                aria-pressed={f.slot_time === s}
                onClick={() => setF({ ...f, slot_time: f.slot_time === s ? '' : s })}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Số người" required error={ferr.party_size}>
          <Input
            type="number"
            min={1}
            max={1000}
            value={f.party_size}
            onChange={(e) => setF({ ...f, party_size: e.target.value })}
          />
        </Field>

        <Field label="Địa điểm giao/setup">
          <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="tòa nhà, quận/huyện" />
        </Field>

        <Field label="MST (nếu cần VAT)" error={ferr.tax_code}>
          <Input value={f.tax_code} onChange={(e) => setF({ ...f, tax_code: e.target.value })} placeholder="10 hoặc 13 số" inputMode="numeric" />
        </Field>

        <Field label="Ghi chú">
          <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={3} placeholder="khẩu vị, dị ứng, giờ setup…" maxLength={500} />
        </Field>

        <Button type="submit" loading={busy} disabled={busy} icon="check">
          {busy ? 'Đang gửi…' : 'Gửi yêu cầu báo giá'}
        </Button>
        <small style={{ color: 'var(--ink-400)' }}>
          <Icon name="info" size={14} /> Gửi là có mã SRV + phiếu CSKH — không cần đặt cọc online.
        </small>
      </form>

      {done ? (
        <div className="alert ok" role="status">
          Đã nhận mã <strong>{done.code}</strong> + phiếu {done.ticket}. CSKH báo giá trong 24h qua SĐT/email.
        </div>
      ) : null}
    </>
  );
}
