import { useState } from 'react';
import { api, writeCsrf } from '../api.js';

// Chỉ gợi ý tài khoản demo ở môi trường development.
// Production build: không điền sẵn, không render credential thật.
const IS_DEV = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

export default function Login({ onDone, toast }) {
  const [u, setU] = useState(IS_DEV ? 'admin' : '');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e?.preventDefault();
    if (!u.trim() || !p) { setErr('Nhập đủ username và mật khẩu.'); return; }
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const out = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u.trim(), password: p }) });
      if (out && out.csrf_token) writeCsrf(out.csrf_token);
      onDone();
    } catch (e2) {
      const msg = e2.status === 401 ? 'Sai tài khoản hoặc mật khẩu.' : ('Đăng nhập lỗi: ' + (e2.message || 'unknown'));
      setErr(msg);
      toast(msg, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card login-wrap">
      <h2 style={{ marginTop: 0 }}>Đăng nhập BizOps AI</h2>
      <p style={{ color: 'var(--ink-400)', fontSize: '.9rem' }}>ERP nội bộ. Phiên dùng cookie httpOnly + CSRF, tự refresh khi hết hạn.</p>
      <form onSubmit={submit} noValidate>
        <label className="field" htmlFor="login-u"><span>Tên đăng nhập</span>
          <input id="login-u" className="input" value={u} onChange={(e) => setU(e.target.value)} placeholder="username" autoComplete="username" required />
        </label>
        <label className="field" htmlFor="login-p"><span>Mật khẩu</span>
          <input id="login-p" className="input" value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="mật khẩu" autoComplete="current-password" required />
        </label>
        {err && <div className="alert err" role="alert">{err}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
      {IS_DEV && (
        <p style={{ fontSize: 12, color: '#64748b' }}>Môi trường dev: dùng tài khoản được cấp (vd admin). Production không hiển thị gợi ý này.</p>
      )}
    </div>
  );
}
