import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

const FAQS = [
  { q: 'Đặt món thế nào?', a: 'Thực đơn → Giỏ → Thanh toán (tên + SĐT + địa chỉ) → nhận mã DHW. Giá do server quyết định theo giờ/kênh, combo trừ kho theo thành phần.' },
  { q: 'Tra cứu đơn ở đâu?', a: 'Mục Tra cứu: nhập mã DHW + SĐT/email đã đặt (2 yếu tố). Hoặc dùng link 30 ngày ở trang xác nhận — token tự tra cứu không cần SĐT.' },
  { q: 'Thanh toán VietQR sao?', a: 'Sau khi đặt, quét VietQR với nội dung = mã đơn DHW. Webhook HMAC tự gạch nợ trong ~1 phút. Bấm “Kiểm tra đã gạch nợ chưa” ở trang xác nhận.' },
  { q: 'Đổi trả thế nào?', a: 'Lỗi NSX đổi trong 7 ngày khi còn hóa đơn: gửi ảnh + mã đơn qua chat/CSKH, QA phản hồi 24h. Đơn COD chưa giao thì hủy qua CSKH.' },
  { q: 'Giao hàng bao lâu?', a: 'Nội thành 1–2 ngày, liên tỉnh 2–4 ngày, phí theo vận đơn hiển thị lúc tra cứu. Teabreak setup tận nơi theo giờ đã đặt.' },
  { q: 'Xuất hóa đơn VAT?', a: 'Nhập MST (10/13 số) lúc đặt teabreak/checkout. Kế toán xuất VAT trong 2 ngày làm việc, gửi qua email.' },
];

export default function Support() {
  const [open, setOpen] = useState(0);

  usePageMeta('Hỗ trợ & FAQ', 'Câu hỏi thường gặp và kênh liên hệ BizOps Café.');

  return (
    <>
      <p className="crumb"><Link to="/">Cửa hàng</Link> / Hỗ trợ</p>
      <div className="sechd">
        <h1 className="page-h1">Hỗ trợ &amp; FAQ</h1>
        <span style={{ color: 'var(--ink-400)' }}>CSKH 8h–22h</span>
      </div>

      <div className="faq-list">
        {FAQS.map((f, i) => {
          const expanded = open === i;
          return (
            <div className="faq-item" key={i}>
              {/* heading-order (WCAG): trang co <h1> nen tieu de cau hoi phai la <h2> */}
              <h2 className="faq-h">
                <button
                  type="button"
                  className="faq-q"
                  aria-expanded={expanded}
                  aria-controls={'faq-panel-' + i}
                  id={'faq-btn-' + i}
                  onClick={() => setOpen(expanded ? -1 : i)}
                >
                  <span>{f.q}</span>
                  <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={18} />
                </button>
              </h2>
              {expanded ? (
                <div className="faq-a" id={'faq-panel-' + i} role="region" aria-labelledby={'faq-btn-' + i}>
                  {f.a}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h2 className="ck-h">Liên hệ nhanh</h2>
        <div className="row">
          <Link className="ui-btn btn-primary ui-btn-sm" to="/tra-cuu">Tra cứu đơn</Link>
          <Link className="ui-btn btn-ghost ui-btn-sm" to="/dich-vu">Đặt teabreak</Link>
          <span style={{ color: 'var(--ink-400)' }}>
            <Icon name="phone" size={16} /> Hotline 1900-xxxx (8h–22h) · fanpage · Zalo OA · nút chat góc phải
          </span>
        </div>
        <div className="row" style={{ marginTop: 'var(--s-3)' }}>
          <Button variant="ghost" icon="chat" onClick={() => window.dispatchEvent(new Event('bizops-open-chat'))}>
            Mở chat CSKH
          </Button>
        </div>
      </div>
    </>
  );
}
