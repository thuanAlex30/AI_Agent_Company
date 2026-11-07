import { useState } from 'react';
import { api, writeCsrf } from '../api.js';

export default function Login({ onDone, toast }) {
  const [u, setU] = useState('admin');
  const [p, setP] = useState('Admin@123');
  async function submit() {
    if (!u.trim() || !p) { toast('Nhập đủ username + password'); return; }
    try {
      // Phase 5: luu csrf_token tu response vao cookie de FE doc duoc
      // va gui header X-CSRF-Token cho cac request sau.
      const out = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u.trim(), password: p }) });
      if (out && out.csrf_token) writeCsrf(out.csrf_token);
      onDone();
    } catch (e) { toast('Login lỗi: ' + e.message); }
  }
  return (
    <div className="card login-wrap">
      <h3>Đăng nhập BizOps</h3>
      <div className="row"><input value={u} onChange={(e) => setU(e.target.value)} placeholder="username (vd: admin)" /></div>
      <div className="row"><input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="mật khẩu" onKeyDown={(e) => e.key === 'Enter' && submit()} /></div>
      <div className="row"><button className="btn" onClick={submit}>Đăng nhập</button></div>
      <p style={{ fontSize: 12, color: '#64748b' }}>Demo dev: admin/Admin@123, ketoan/User@123, kho/User@123, sale/User@123, cskh/User@123</p>
    </div>
  );
}
