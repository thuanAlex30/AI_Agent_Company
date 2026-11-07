// pages/Landing.jsx — Trang chu gioi thieu san pham BizOps AI (ERP + AI Agent).
// Noi dung chi neu nhung gi code/contract xac nhan:
// - 12 phong ban (docs/contract/manifest.json -> departments12)
// - Module: sales/finance/supply/HR/helpdesk/governance/marketing/IT/QA/product (openapi.yaml + table-ownership)
// - Luong O2C: order -> ton kho (moveStock) -> cong no -> thanh toan (state-machines.md ORDER_FLOW)
// - AI Agent: rule engine + RAG top-3 + 12 skills + brief (agent_svc/src/*, docs/07-ai-design.md)
// - Quan tri: RBAC roles-permissions.json + scope fail-closed + audit append-only + refresh xoay vong + CSRF
// - Khong quang cao tinh nang chua xac minh; khong bia khach hang/SLA/gia/tich hop.
import { Link } from 'react-router-dom';
import usePageMeta from '../hooks/usePageMeta.js';
import useReveal from '../hooks/useReveal.js';

function Reveal({ children, className = '', id }) {
  const ref = useReveal();
  return <div ref={ref} id={id} className={'reveal scroll-mt ' + className}>{children}</div>;
}

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';
const ERP_URL = import.meta.env.VITE_ERP_URL || 'http://127.0.0.1:5173';

const MODULES = [
  { k: 'sales', t: 'Bán hàng (O2C)', d: 'Lead → báo giá → hợp đồng → đơn hàng. Đơn qua cổng duyệt khi đạt ngưỡng, giá server quyết định lúc checkout, chống trùng đơn bằng Idempotency-Key.' },
  { k: 'finance', t: 'Tài chính & công nợ', d: 'Công nợ phải thu/phải trả, ghi thanh toán từng lần có khóa chống double-credit, import sao kê + đối soát, nhắc nợ 1 lần/ngày/khoản.' },
  { k: 'supply', t: 'Mua hàng & kho', d: 'PO qua duyệt mới được nhận hàng/nhập kho. Xuất kho khóa theo SKU, hết hàng báo 409 và không tạo đơn mồ côi.' },
  { k: 'hr', t: 'Nhân sự', d: 'Hồ sơ, chấm công gắn JWT, tuyển dụng, đào tạo, bảng lương tạm tính theo ngày present (chỉ vai được phép mới thấy lương).' },
  { k: 'cskh', t: 'CSKH & Helpdesk', d: 'Ticket theo quy trình open → processing → resolved → closed, SLA theo giờ lịch, chat web qua AI Agent, đánh giá sau hỗ trợ.' },
  { k: 'gov', t: 'Phê duyệt & kiểm soát', d: 'Ma trận duyệt theo ngưỡng tiền, không tự duyệt, không ép cấp; mọi mutation ghi audit trong cùng transaction, audit append-only.' },
];

const FLOW = [
  { t: '1. Tạo đơn', d: 'Đơn hàng tạo ở trạng thái pending (≥50 triệu lên pending_approval). Giá do server tính, combo tách thành phần.' },
  { t: '2. Trừ kho', d: 'Trừ tồn trong cùng transaction, khóa dòng theo SKU. Thiếu hàng → 409, toàn bộ đơn rollback.' },
  { t: '3. Công nợ & giao', d: 'Sinh công nợ phải thu, tạo vận đơn. Trạng thái đơn đi theo ORDER_FLOW, không nhảy bước.' },
  { t: '4. Thanh toán', d: 'Thanh toán đủ khi chưa giao xong phải qua partial trước paid. Webhook VietQR ký HMAC, tự gạch nợ.' },
];

const FAQS = [
  { q: 'BizOps AI là gì?', a: 'BizOps AI là nền tảng ERP + AI Agent cho doanh nghiệp vừa và nhỏ: quản lý bán hàng, tài chính, kho, nhân sự, CSKH, phê duyệt trên một database, kèm trợ lý chat chạy bằng rule engine + RAG. Trang này là website giới thiệu sản phẩm, khác với ứng dụng ERP nội bộ.' },
  { q: 'Ai nên dùng BizOps AI?', a: 'Chủ doanh nghiệp và quản lý cần một hệ thống quản trị chung thay cho file rời rạc. ERP nội bộ phân quyền theo 12 phòng ban (sales, finance, supply, HR, CSKH…) nên mỗi vai chỉ thấy đúng phạm vi của mình.' },
  { q: 'AI Agent làm được gì?', a: 'Agent hiện tại là rule engine + RAG (trích top-3 đoạn tài liệu kèm nguồn) + 12 skill theo dõi theo phòng ban + bản brief mỗi sáng. Nó hỗ trợ tra cứu và CSKH, không phải hệ multi-agent tự hành.' },
  { q: 'Dữ liệu trên trang này có thật không?', a: 'Đây là bản demo: số liệu, sản phẩm mẫu và đoạn chat minh họa chỉ phục vụ demo. Khu demo bán hàng F&B được tách riêng tại /demo-fb và gắn nhãn dữ liệu minh họa.' },
  { q: 'Xem demo bằng cách nào?', a: 'Mở khu demo F&B tại /demo-fb để thấy luồng đặt món → tồn kho → công nợ → tra cứu. Ứng dụng ERP nội bộ chạy riêng (mặc định http://127.0.0.1:5173) và cần tài khoản demo do quản trị viên cấp.' },
  { q: 'Đăng ký demo thế nào?', a: 'Hiện website chưa có form nhận lead public. Để đăng ký demo, gửi email cho chúng tôi (xem mục Liên hệ) kèm tên công ty, quy mô và module quan tâm. Chúng tôi sẽ cấu hình form online sau.' },
];

export default function Landing() {
  usePageMeta(
    'BizOps AI — ERP và AI Agent cho doanh nghiệp vừa và nhỏ',
    'BizOps AI — ERP và AI Agent hỗ trợ doanh nghiệp quản lý bán hàng, tài chính, kho, nhân sự, CSKH và phê duyệt trên một nền tảng. Xem luồng mẫu và demo F&B.'
  );
  const mailto = CONTACT_EMAIL
    ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Đăng ký demo BizOps AI')}`
    : null;

  return (
    <>
      {/* HERO */}
      <section className="lz-hero" aria-labelledby="lz-hero-h">
        <div>
          <span className="ui-badge bd-brand">Website giới thiệu sản phẩm · khác với ứng dụng ERP nội bộ</span>
          <h1 id="lz-hero-h">BizOps AI — ERP và AI Agent cho doanh nghiệp vừa và nhỏ</h1>
          <p className="lz-lead">
            Một nền tảng quản lý vận hành: bán hàng, tài chính, kho, nhân sự,
            CSKH và phê duyệt — kèm trợ lý chat chạy bằng rule engine + RAG.
          </p>
          <div className="cta">
            <a className="ui-btn btn-primary ui-btn-lg" href="#demo">Đăng ký demo</a>
            <a className="ui-btn btn-ghost ui-btn-lg" href="#tinh-nang">Khám phá tính năng</a>
          </div>
          <p className="lz-note">Bản demo — số liệu và nội dung mẫu chỉ phục vụ minh họa.</p>
        </div>
        <div className="lz-mock" role="img" aria-label="Minh họa giao diện ERP BizOps (ảnh minh họa, không phải screenshot thật)">
          <div className="lz-mock-bar"><span /><span /><span /></div>
          <div className="lz-mock-grid">
            <div className="lz-mock-card"><small>Đơn 30 ngày</small><strong>—</strong><i>demo</i></div>
            <div className="lz-mock-card"><small>Công nợ mở</small><strong>—</strong><i>demo</i></div>
            <div className="lz-mock-card"><small>Ticket mở</small><strong>—</strong><i>demo</i></div>
            <div className="lz-mock-card"><small>Tồn kho thấp</small><strong>—</strong><i>demo</i></div>
          </div>
          <small className="lz-mock-cap">Minh họa giao diện (HTML/CSS) — không phải ảnh chụp sản phẩm thật</small>
        </div>
      </section>

      {/* VAN DE */}
      <Reveal className="lz-sec" id="van-de">
        <h2>Công việc hệ thống hỗ trợ</h2>
        <div className="grid g3">
          <article className="card"><h3>Đơn → kho → tiền khớp nhau</h3><p>Đơn, trừ kho, công nợ và vận đơn ghi trong cùng một transaction. Hết hàng thì đơn không được tạo — không còn đơn mồ côi.</p></article>
          <article className="card"><h3>Duyệt đúng cấp</h3><p>Cấp duyệt tính từ ma trận duyệt theo số tiền, người đề xuất không tự duyệt, client không ép cấp được.</p></article>
          <article className="card"><h3>Mỗi vai thấy đúng phần mình</h3><p>Phạm vi theo phòng ban, chặn sai phạm ở server (fail-closed). Mọi quyết định từ chối đều ghi log để truy vết.</p></article>
        </div>
      </Reveal>

      {/* MODULE */}
      <Reveal className="lz-sec" id="tinh-nang">
        <div className="sechd"><h2>Module đã triển khai</h2><span style={{ color: 'var(--ink-400)' }}>Đối chiếu openapi.yaml + contract</span></div>
        <div className="grid g3">
          {MODULES.map((m) => (
            <article className="card" key={m.k}><h3>{m.t}</h3><p style={{ color: 'var(--ink-600)' }}>{m.d}</p></article>
          ))}
        </div>
        <p className="lz-note">Ngoài ra: marketing (chiến dịch), IT (sự cố theo IT_FLOW), QA (kiểm lỗi theo ref_type), Product (tính năng theo giai đoạn) — xem tài liệu contract.</p>
      </Reveal>

      {/* LUONG */}
      <Reveal className="lz-sec" id="quy-trinh">
        <div className="sechd"><h2>Luồng mẫu: đơn → kho → nợ → tiền</h2></div>
        <ol className="lz-flow">
          {FLOW.map((s) => (
            <li key={s.t}><strong>{s.t}</strong><p>{s.d}</p></li>
          ))}
        </ol>
        <p className="lz-note">Chuyển trạng thái sai quy tắc trả 400, hệ thống không cập nhật lệch (xem state-machines.md).</p>
      </Reveal>

      {/* AI */}
      <Reveal className="lz-sec" id="ai-agent">
        <div className="sechd"><h2>AI Agent: rule engine + RAG + skills</h2></div>
        <div className="grid g3">
          <article className="card"><h3>Trả lời có kiểm soát</h3><p>Chuẩn hóa tiếng Việt, khớp từ có dấu trước, RAG trích top-3 đoạn kèm nguồn. Số lạ ngoài ngữ cảnh bị che kèm cờ [CẦN-DUYỆT].</p></article>
          <article className="card"><h3>12 skill theo phòng ban</h3><p>Mỗi skill đọc số liệu tổng hợp của một khối (sales, finance, supply, HR, CSKH…) và bản brief sáng. Không bao giờ đưa cost/lương vào ngữ cảnh.</p></article>
          <article className="card"><h3>Giới hạn rõ ràng</h3><p>Chat public giới hạn lượt, xác thực qua backend (key giữ ở server). Đây là trợ lý hỗ trợ — không phải hệ multi-agent tự hành.</p></article>
        </div>
      </Reveal>

      {/* QUAN TRI */}
      <Reveal className="lz-sec" id="quan-tri">
        <div className="sechd"><h2>Quản trị và phân quyền</h2></div>
        <ul className="lz-list">
          <li>RBAC server-side theo <code>roles-permissions.json</code>; phạm vi phòng ban fail-closed, header <code>X-Scope-Depts</code> để audit.</li>
          <li>Phiên đăng nhập: access 30 phút + refresh xoay vòng atomic, phát hiện dùng lại thì thu hồi toàn bộ phiên; CSRF double-submit cho mọi mutation.</li>
          <li>Audit ghi trong cùng transaction với mutation; bảng audit append-only (trigger chặn sửa/xóa).</li>
        </ul>
      </Reveal>

      {/* DEMO CTA */}
      <Reveal className="lz-sec" id="demo">
        <div className="sechd"><h2>Xem demo</h2></div>
        <div className="grid g3">
          <article className="card">
            <h3>Demo ngành F&B</h3>
            <p>Khu bán hàng mẫu (cà phê/trà/bánh, giỏ, thanh toán, tra cứu 2 yếu tố). Dữ liệu minh họa.</p>
            <Link className="ui-btn btn-ghost" to="/demo-fb">Mở demo F&B →</Link>
          </article>
          <article className="card">
            <h3>ERP nội bộ</h3>
            <p>Ứng dụng ERP 11 tab theo quyền, chạy riêng khỏi website này. Cần tài khoản demo do quản trị viên cấp.</p>
            <a className="ui-btn btn-ghost" href={ERP_URL} target="_blank" rel="noreferrer">Mở ERP ({ERP_URL.replace('http://', '')}) →</a>
          </article>
          <article className="card">
            <h3>Đăng ký demo</h3>
            <p>Website chưa có form nhận lead public nên không có gửi form giả. Liên hệ qua email cấu hình:</p>
            {mailto
              ? <a className="ui-btn btn-primary" href={mailto}>Gửi email đăng ký →</a>
              : <p className="lz-note">Chưa cấu hình email liên hệ (<code>VITE_CONTACT_EMAIL</code>). Chủ repo bổ sung để bật nút gửi mail.</p>}
          </article>
        </div>
      </Reveal>

      {/* FAQ */}
      <Reveal className="lz-sec" id="faq">
        <div className="sechd"><h2>Hỏi đáp</h2><Link className="ui-btn btn-ghost ui-btn-sm" to="/ho-tro">Trang hỗ trợ →</Link></div>
        <div className="faq-list">
          {FAQS.map((f, i) => (
            <details className="faq-item" key={i} open={i === 0}>
              <summary className="faq-q">{f.q}</summary>
              <div className="faq-a">{f.a}</div>
            </details>
          ))}
        </div>
      </Reveal>
    </>
  );
}
