import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';

// FAQ trung thuc: chi neu nhung gi code/contract xac nhan, khong bia chinh sach.
const FAQS = [
  { q: 'BizOps AI gồm những gì?', a: 'ERP nhiều phòng ban (bán hàng, tài chính, mua/kho, nhân sự, CSKH, phê duyệt…) + AI Agent (rule engine + RAG top-3 kèm nguồn + 12 skill + brief sáng). Chi tiết module xem tại trang chủ mục Tính năng.' },
  { q: 'Website này khác gì ứng dụng ERP nội bộ?', a: 'Đây là website giới thiệu sản phẩm (bản demo, không cần đăng nhập). Ứng dụng ERP nội bộ chạy riêng, có đăng nhập + phân quyền theo 12 phòng ban, mỗi vai chỉ thấy đúng phạm vi của mình.' },
  { q: 'Khu Demo F&B là gì?', a: 'Là khu bán hàng mẫu giữ lại từ tên demo cũ (thực đơn, giỏ, thanh toán, tra cứu 2 yếu tố) để thử luồng đơn → kho → nợ → tiền. Dữ liệu minh họa, không phải cửa hàng thật. Mở tại /demo-fb.' },
  { q: 'Tra cứu đơn demo ở đâu?', a: 'Trong khu demo F&B: nhập mã DHW + SĐT/email đã đặt (2 yếu tố), hoặc dùng link 30 ngày ở trang xác nhận. Kênh chat công khai không bao giờ trả số tiền công nợ.' },
  { q: 'Đăng ký demo thế nào?', a: 'Website chưa có form nhận lead public nên không có nút gửi form giả. Gửi email kèm tên công ty, quy mô và module quan tâm — xem mục Liên hệ nhanh bên dưới.' },
  { q: 'AI Agent có phải multi-agent tự hành?', a: 'Không. Agent hiện tại là trợ lý hỗ trợ: rule engine + RAG trích tài liệu kèm nguồn + skill theo dõi theo phòng ban. Số lạ ngoài ngữ cảnh bị che kèm cờ [CẦN-DUYỆT].' },
];

export default function Support() {
  const [open, setOpen] = useState(0);
  const mailto = CONTACT_EMAIL
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Đăng ký demo BizOps AI')}`
    : null;

  usePageMeta('Hỗ trợ & FAQ', 'Hỏi đáp về BizOps AI: sản phẩm, demo F&B, đăng ký demo, AI Agent.');

  return (
    <>
      <p className="crumb"><Link to="/">BizOps AI</Link> / Hỗ trợ</p>
      <div className="sechd">
        <h1 className="page-h1">Hỗ trợ &amp; FAQ</h1>
        <span style={{ color: 'var(--ink-400)' }}>Website giới thiệu sản phẩm · bản demo</span>
      </div>

      <div className="faq-list">
        {FAQS.map((f, i) => {
          const expanded = open === i;
          return (
            <div className="faq-item" key={i}>
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
          <Link className="ui-btn btn-primary ui-btn-sm" to="/demo-fb">Mở demo F&B</Link>
          <a className="ui-btn btn-ghost ui-btn-sm" href="/#demo">Đăng ký demo</a>
          <span style={{ color: 'var(--ink-400)' }}>
            <Icon name="mail" size={16} />{' '}
            {mailto ? <a href={mailto} style={{ fontWeight: 700 }}>{CONTACT_EMAIL}</a> : 'Chưa cấu hình email liên hệ (VITE_CONTACT_EMAIL)'}
            {' '}· nút chat góc phải (trợ lý demo)
          </span>
        </div>
        <div className="row" style={{ marginTop: 'var(--s-3)' }}>
          <Button variant="ghost" icon="chat" onClick={() => window.dispatchEvent(new Event('bizops-open-chat'))}>
            Mở chat trợ lý
          </Button>
        </div>
      </div>
    </>
  );
}
