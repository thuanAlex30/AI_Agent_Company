import { Link, useSearchParams } from 'react-router-dom';
export default function Confirm() {
  const [sp] = useSearchParams();
  const code = sp.get('code') || '';
  const token = sp.get('token') || '';
  return (
    <div className="card">
      <h2>Đặt hàng thành công 🎉</h2>
      <p>Mã đơn: <strong>{code}</strong></p>
      {token && <p>Link tra cứu riêng (30 ngày): <Link to={`/tra-cuu?code=${encodeURIComponent(code)}`}>mở tra cứu</Link></p>}
      <p>COD: shipper thu khi giao · VietQR: quét mã với nội dung = {code} · Ví: làm theo hướng dẫn CSKH.</p>
      <div className="row">
        <Link className="btn" to={`/tra-cuu?code=${encodeURIComponent(code)}`}>Tra cứu đơn</Link>
        <Link className="btn ghost" to="/san-pham">Mua tiếp</Link>
      </div>
      <p style={{ color: '#6b7280' }}>Hotline 1900-xxxx · giữ mã DHW để tra cứu.</p>
    </div>
  );
}
