import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProductsBySkus, postOrder } from '../services/api.js';
import { fmtVND, uuid } from '../utils/format.js';
import { getCart, clearCart } from '../store/cart.js';
import Stepper from '../components/ui/Stepper.jsx';
import Button from '../components/ui/Button.jsx';
import Field, { Input, Select, Textarea } from '../components/ui/Field.jsx';
import Icon from '../components/ui/Icon.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState, ErrorState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

const PHONE_RE = /^0\d{9,10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STEPS = [
  { key: 'info', label: 'Thông tin' },
  { key: 'delivery', label: 'Giao nhận & thanh toán' },
  { key: 'confirm', label: 'Xác nhận' },
];

const PAY_METHODS = [
  { value: 'bank', label: 'VietQR', desc: 'Quét mã, tự gạch nợ trong giây lát' },
  { value: 'cash', label: 'COD', desc: 'Shipper thu tiền mặt khi giao' },
  { value: 'ewallet', label: 'Ví điện tử', desc: 'CSKH hướng dẫn qua chat' },
];

export default function Checkout({ toast }) {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', note: '', pay_method: 'bank' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  // Idempotency-Key: sinh 1 key/lan dat, GIU LAI khi that bai de gui lai cung key (tranh don trung)
  const idemKey = useRef(uuid());
  const submitLock = useRef(false);

  usePageMeta('Thanh toán', 'Hoàn tất đặt món BizOps Café — VietQR, COD hoặc ví điện tử.');

  useEffect(() => {
    let alive = true;
    (async () => {
      const cart = getCart();
      if (!cart.length) { if (alive) setRows([]); return; }
      const map = await getProductsBySkus(cart.map((i) => i.sku)).catch(() => new Map());
      let sum = 0;
      const out = cart.map((it) => {
        const p = map.get(it.sku);
        if (!p) return { ...it, name: it.sku, price: 0, missing: true };
        sum += Number(p.price) * Number(it.qty);
        return { ...it, name: p.name, price: p.price, stock: p.stock };
      });
      if (alive) { setRows(out); setTotal(sum); }
    })();
    return () => { alive = false; };
  }, []);

  function validateStep(s) {
    const e = {};
    if (s === 0) {
      if (!f.name.trim()) e.name = 'Nhập họ tên';
      if (!PHONE_RE.test(f.phone.trim()) && !EMAIL_RE.test(f.email.trim())) e.phone = 'Cần SĐT VN (09xxxxxxxx) hoặc email';
      else if (f.phone.trim() && !PHONE_RE.test(f.phone.trim())) e.phone = 'SĐT VN chưa đúng';
      if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = 'Email chưa đúng';
    }
    if (s === 1) {
      if (!['cash', 'bank', 'ewallet'].includes(f.pay_method)) e.pay_method = 'Chọn phương thức';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(2, s + 1));
  }

  async function submit(ev) {
    ev.preventDefault();
    if (submitLock.current) return;            // chong bam dup
    if (!rows || !rows.length) { toast && toast('Giỏ trống'); return; }
    if (rows.some((r) => r.missing || r.stock === 'out_of_stock')) {
      toast && toast('Có món hết/ngừng bán — quay lại giỏ');
      return;
    }
    if (!validateStep(0) || !validateStep(1)) { setStep(0); return; }

    submitLock.current = true;
    setBusy(true);
    setSubmitErr('');
    try {
      // Dung LAI cung key neu gui lai -> server dedupe, khong tao don trung
      const d = await postOrder({
        ...f,
        name: f.name.trim(),
        phone: f.phone.trim(),
        email: f.email.trim(),
        items: rows.map((r) => ({ sku: r.sku, qty: Number(r.qty) })),
      }, idemKey.current);
      clearCart();
      // Lookup token CHI giu trong sessionStorage — KHONG dua vao URL (spec §8)
      // va KHONG log ra console.
      try {
        if (d.lookup_token) sessionStorage.setItem('bizops-lookup:' + d.code, d.lookup_token);
      } catch {}
      nav('/xac-nhan?code=' + encodeURIComponent(d.code) + '&amount=' + encodeURIComponent(d.amount || total));
    } catch (ex) {
      setSubmitErr(ex.message || 'Không gửi được đơn. Kiểm tra mạng rồi thử lại.');
      if (toast) toast.error('Đặt hàng chưa thành công — bạn có thể bấm lại, đơn sẽ không bị trùng.');
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  if (rows === null) {
    return (
      <div className="card">
        <Skeleton h={28} w="35%" />
        <Skeleton h={220} style={{ marginTop: 16 }} />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon="cart"
        heading="Thanh toán"
        title="Giỏ trống"
        description="Chọn món trước khi thanh toán nhé."
        action={<Link className="ui-btn btn-primary" to="/san-pham">Xem thực đơn</Link>}
      />
    );
  }

  const hasOut = rows.some((r) => r.missing || r.stock === 'out_of_stock');

  return (
    <>
      <p className="crumb"><Link to="/">Cửa hàng</Link> / <Link to="/gio">Giỏ</Link> / Thanh toán</p>
      <h1 className="page-h1" style={{ marginBottom: 'var(--s-4)' }}>Thanh toán</h1>

      <Stepper steps={STEPS} current={step} />

      <div className="checkout-layout">
        <form className="card" onSubmit={submit} noValidate>
          {step === 0 ? (
            <>
              {/* heading-order (WCAG): h1 -> h2 (khong nhay cap). CSS giong h3 cu. */}
              <h2 className="ck-h">Thông tin liên hệ</h2>
              <Field label="Họ tên" required error={errs.name}>
                <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoComplete="name" />
              </Field>
              <Field label="SĐT" required error={errs.phone} hint="SĐT Việt Nam 10 số, bắt đầu bằng 0">
                <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="09xxxxxxxx" inputMode="tel" autoComplete="tel" />
              </Field>
              <Field label="Email" error={errs.email} hint="Không bắt buộc nếu đã có SĐT">
                <Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" autoComplete="email" />
              </Field>
              <Field label="Địa chỉ giao" hint="Bắt buộc nếu bạn chọn giao hàng">
                <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder="số nhà, đường, quận/huyện" autoComplete="street-address" />
              </Field>
              <Field label="Ghi chú">
                <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="ít đá, giao giờ hành chính…" maxLength={500} rows={3} />
              </Field>
              <Button type="button" size="lg" iconRight="chevronRight" onClick={next}>Tiếp tục</Button>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h2 className="ck-h">Giao nhận &amp; thanh toán</h2>
              <Field label="Phương thức thanh toán" required error={errs.pay_method}>
                <div className="pay-methods" role="radiogroup" aria-label="Phương thức thanh toán">
                  {PAY_METHODS.map((m) => (
                    <label key={m.value} className={'pay-method' + (f.pay_method === m.value ? ' is-active' : '')}>
                      <input
                        type="radio"
                        name="pay_method"
                        value={m.value}
                        checked={f.pay_method === m.value}
                        onChange={(e) => setF({ ...f, pay_method: e.target.value })}
                      />
                      <span>
                        <strong>{m.label}</strong>
                        <small style={{ display: 'block', color: 'var(--ink-400)' }}>{m.desc}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </Field>

              {f.pay_method === 'bank' ? <div className="alert">Sau khi đặt: quét VietQR với nội dung = mã đơn DHW. Webhook HMAC tự gạch nợ trong giây lát.</div> : null}
              {f.pay_method === 'cash' ? <div className="alert">Shipper thu tiền mặt khi giao. Chuẩn bị tiền lẻ giúp shop nhé.</div> : null}

              <div className="row" style={{ marginTop: 'var(--s-3)' }}>
                <Button type="button" variant="ghost" icon="chevronLeft" onClick={() => setStep(0)}>Quay lại</Button>
                <Button type="button" size="lg" iconRight="chevronRight" onClick={next}>Xem lại đơn</Button>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2 className="ck-h">Xác nhận đặt hàng</h2>
              <div className="line"><span>Họ tên</span><strong>{f.name}</strong></div>
              <div className="line"><span>Liên hệ</span><strong>{f.phone || f.email}</strong></div>
              {f.address ? <div className="line"><span>Địa chỉ</span><strong>{f.address}</strong></div> : null}
              {f.note ? <div className="line"><span>Ghi chú</span><strong>{f.note}</strong></div> : null}
              <div className="line">
                <span>Thanh toán</span>
                <strong>{PAY_METHODS.find((m) => m.value === f.pay_method)?.label}</strong>
              </div>

              {hasOut ? (
                <ErrorState title="Có món không còn hàng" description="Quay lại giỏ hàng để cập nhật trước khi đặt." />
              ) : null}

              {submitErr ? (
                <div className="alert" role="alert">
                  <Icon name="alert" size={18} /> {submitErr}
                </div>
              ) : null}

              <div className="row" style={{ marginTop: 'var(--s-4)' }}>
                <Button type="button" variant="ghost" icon="chevronLeft" onClick={() => setStep(1)} disabled={busy}>Quay lại</Button>
                <Button type="submit" size="lg" loading={busy} disabled={busy || hasOut} icon="check">
                  {busy ? 'Đang đặt…' : `Đặt hàng · ${fmtVND(total)}`}
                </Button>
              </div>
              {busy ? <small style={{ color: 'var(--ink-400)' }}>Đừng bấm lần hai — hệ thống đang xử lý.</small> : null}
            </>
          ) : null}
        </form>

        <aside className="checkout-summary" aria-label="Tóm tắt đơn hàng">
          <h2 className="ck-h" style={{ marginTop: 0 }}>Tóm tắt đơn</h2>
          {rows.map((r) => (
            <div className="line" key={r.sku}>
              <span>{r.name} × {r.qty}</span>
              <span>{fmtVND(r.price * r.qty)}{r.missing ? ' (ngừng bán)' : ''}</span>
            </div>
          ))}
          <div className="sum-total">
            <span>Tổng</span>
            <span>{fmtVND(total)}</span>
          </div>
          <small style={{ color: 'var(--ink-400)', display: 'block', marginTop: 'var(--s-2)' }}>
            Giá do server quyết định theo giờ/kênh · combo trừ kho theo thành phần
          </small>
        </aside>
      </div>
    </>
  );
}
