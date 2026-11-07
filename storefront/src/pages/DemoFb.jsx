// pages/DemoFb.jsx — Khu demo F&B: giu nguyen shop de demo
// luong dat mon -> ton kho -> cong no -> tra cuu, nhung gan nhan demo ro rang
// de khong lan at dinh vi BizOps AI.
import { Link } from 'react-router-dom';
import Home from './Home.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

export default function DemoFb({ toast }) {
  usePageMeta(
    'Demo ngành F&B (dữ liệu minh họa)',
    'Khu demo ERP cho mô hình F&B: thực đơn mẫu, giỏ, thanh toán, tra cứu. Dữ liệu minh họa, không phải cửa hàng thật.'
  );
  return (
    <>
      <p className="crumb"><Link to="/">BizOps AI</Link> / Demo F&B</p>
      <div className="alert" role="note" style={{ marginBottom: 'var(--s-4)' }}>
        <strong>Dữ liệu minh họa — demo ERP cho mô hình F&B.</strong>
        <span> Khu này giữ lại để thử luồng đặt món → tồn kho → công nợ → tra cứu. Không phải cửa hàng thật.</span>
        <Link className="ui-btn btn-ghost ui-btn-sm" to="/">Về trang BizOps AI →</Link>
      </div>
      <Home
        toast={toast}
        pageTitle="Demo F&B (dữ liệu minh họa)"
        pageDesc="Khu demo ERP cho mô hình F&B: thực đơn mẫu, giỏ, thanh toán, tra cứu. Dữ liệu minh họa."
      />
    </>
  );
}
