import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { lookupByToken } from '../services/api.js';
import { fmtVND } from '../utils/format.js';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

/** Tick SVG ve bang stroke-dashoffset (600ms, mot lan) */
function SuccessTick() {
  const [draw, setDraw] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDraw(true), 80);
    return () => clearTimeout(t);
  }, []);
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true" className="success-tick">
      <circle cx="36" cy="36" r="33" fill="none" stroke="var(--ok)" strokeWidth="3" opacity=".25" />
      <path
        d="M22 37 L32 47 L51 27"
        fill="none"
        stroke="var(--ok)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 60,
          strokeDashoffset: draw ? 0 : 60,
          transition: 'stroke-dashoffset 600ms var(--ease)',
        }}
      />
    </svg>
  );
}

export default function Confirm({ toast }) {
  const [sp] = useSearchParams();
  const code = sp.get('code') || '';
  const amount = Number(sp.get('amount') || 0);
  const [copied, setCopied] = useState('');
  const [checking, setChecking] = useState('');
  // Lookup token chi doc tu sessionStorage (khong nam trong URL, khong log console)
  const [token, setToken] = useState('');

  usePageMeta('Đặt hàng thành công', 'Đơn hàng của bạn đã được tiếp nhận.');

  useEffect(() => {
    if (!code) return;
    try {
      setToken(sessionStorage.getItem('bizops-lookup:' + code) || '');
    } catch { setToken(''); }
  }, [code]);

  async function copy(t, label) {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      toast && toast('Không copy được — bạn ghi tay mã nhé');
    }
  }

  async function checkPaid() {
    if (!token) { setChecking('Nhập SĐT/email ở trang Tra cứu để xem trạng thái thanh toán.'); return; }
    setChecking('Đang kiểm tra…');
    try {
      const d = await lookupByToken(code, token);
      setChecking(d.remain === 0
        ? `Đã thanh toán đủ ${fmtVND(d.paid)} — đơn ${d.status}.`
        : `Còn lại ${fmtVND(d.remain)} (đã trả ${fmtVND(d.paid)}). Quét VietQR nội dung = ${code}.`);
    } catch {
      setChecking('Chưa thấy gạch nợ — VietQR cần ~1 phút, bấm lại sau nhé.');
    }
  }

  return (
    <div className="card done confirm-card">
      <SuccessTick />
      {/* SPEC §8/§10: moi route phai co DUNG MOT <h1> (ke ca trang xac nhan).
          h2 cu giong hien thi, nhung dung <h1> de bao dam "page-has-heading-one". */}
      <h1 className="confirm-h">Đặt hàng thành công</h1>

      <div className="confirm-code">
        <span className="confirm-code-label">Mã đơn</span>
        <strong className="code">{code}</strong>
        <Button size="sm" variant="ghost" icon="copy" onClick={() => copy(code, 'code')}>
          {copied === 'code' ? 'Đã sao chép' : 'Sao chép'}
        </Button>
      </div>

      {amount ? <p>Tạm tính: <strong>{fmtVND(amount)}</strong> (giá server lúc checkout)</p> : null}

      <div className="paybox">
        <p>
          <strong>VietQR:</strong> quét mã với nội dung = <strong>{code}</strong>{' '}
          <Button size="sm" variant="ghost" icon="copy" onClick={() => copy(code, 'qr')}>
            {copied === 'qr' ? 'Đã sao chép' : 'Sao chép nội dung'}
          </Button>
        </p>
        <p><strong>COD:</strong> shipper thu khi giao · <strong>Ví:</strong> làm theo hướng dẫn CSKH.</p>
        <div className="row">
          <Button size="sm" icon="refresh" onClick={checkPaid}>Kiểm tra đã gạch nợ chưa</Button>
        </div>
        {checking ? <div className="alert" role="status">{checking}</div> : null}
      </div>

      {token ? (
        <div className="alert">
          <Icon name="shield" size={18} />
          Link tra cứu riêng (30 ngày, không cần SĐT) đã lưu trong phiên này — đừng chia sẻ công khai.
        </div>
      ) : null}

      <div className="row">
        <Link className="ui-btn btn-primary" to={`/tra-cuu?code=${encodeURIComponent(code)}`}>Tra cứu đơn</Link>
        <Link className="ui-btn btn-ghost" to="/san-pham">Mua tiếp</Link>
      </div>

      <p style={{ color: 'var(--ink-400)', fontSize: 'var(--fs-sm)' }}>
        Đơn demo — giữ mã DHW để tra cứu thử ở mục Demo F&B.
      </p>
    </div>
  );
}
