import { useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import CeoTab from './tabs/CeoTab.jsx';
import SalesTab from './tabs/SalesTab.jsx';
import FinanceTab from './tabs/FinanceTab.jsx';
import OpsTab from './tabs/OpsTab.jsx';
import CskhTab from './tabs/CskhTab.jsx';
import MarketingTab from './tabs/MarketingTab.jsx';
import HrTab from './tabs/HrTab.jsx';
import ItTab from './tabs/ItTab.jsx';
import LegalTab from './tabs/LegalTab.jsx';
import QaTab from './tabs/QaTab.jsx';
import ProductTab from './tabs/ProductTab.jsx';

const TABS = [
  { id: 'ceo', label: 'CEO', need: ['orders.read'] },
  { id: 'sales', label: 'Sales', need: ['orders.write', 'leads.write'] },
  { id: 'finance', label: 'Finance', need: ['finance.read', 'payments.write'] },
  { id: 'ops', label: 'Ops/Kho', need: ['stock.write', 'shipments.write', 'po.write'] },
  { id: 'cskh', label: 'CSKH', need: ['tickets.write', 'chat.write'] },
  { id: 'marketing', label: 'Marketing', need: ['campaigns.write'] },
  { id: 'hr', label: 'HR', need: ['hr.read', 'employees.write'] },
  { id: 'it', label: 'IT', need: ['it.write'] },
  { id: 'legal', label: 'Legal', need: ['approvals.read', 'audit.read', 'risks.write'] },
  { id: 'qa', label: 'QA', need: ['qa.write'] },
  { id: 'product', label: 'Product', need: ['productfeat.write', 'sop.write'] },
];

// Phase 5: khop backend (`requirePerm` can DUONG quyen cua tab).
// Truoc day `.some()` => chi 1 quyen la du => hien tab nhung backend 403.
function canSeeTab(perms, role, need) {
  if (role === 'owner' || role === 'ceo') return true;
  return (need || []).every((p) => (perms || []).includes(p));
}

export default function App() {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState([]);
  const [scope, setScope] = useState(null);
  const [tab, setTab] = useState('ceo');
  const [toasts, setToasts] = useState([]);
  const [version, setVersion] = useState('');

  function toast(msg) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }

  async function boot() {
    try {
      const data = await api('/api/auth/me');
      setUser(data.user);
      setPerms(data.permissions || []);
      // Phase 3/5: hien thi pham vi scope (de nguoi dung biet minh thay
      // duoc du lieu phong ban nao — server van la noi quyet dinh).
      setScope(data.scope || null);
      const role = data.user && data.user.role;
      const allowed = TABS.filter((t) => canSeeTab(data.permissions || [], role, t.need));
      if (allowed.length && !allowed.some((t) => t.id === tab)) setTab(allowed[0].id);
    } catch {
      setUser(null);
      setPerms([]);
      setScope(null);
    }
  }

  useEffect(() => { boot(); }, []);

  // Phase 5: version tu /api/health (khong hardcode 'v6.1' trong UI).
  useEffect(() => {
    let alive = true;
    fetch('/api/health').then((r) => r.json()).then((b) => {
      if (!alive || !b || !b.ok) return;
      const v = (b.data && (b.data.version || b.data.app_version)) || '';
      if (v) setVersion(v);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Phase 5: nghe `auth:expired` (api.js phat khi refresh that bai) =>
  // dang xuat ngan + thong bao.
  useEffect(() => {
    function onExpired() {
      setUser(null);
      setPerms([]);
      setScope(null);
      toast('Phi dang nhap da het, vui long dang nhap lai');
    }
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    setUser(null);
    setPerms([]);
    setScope(null);
  }

  const scopeText = scope
    ? (scope.all_depts ? 'toan cong ty' : (scope.depts === 'ALL' ? 'toan cong ty' : (scope.depts || []).join(', ')))
    : '';

  return (
    <>
      <header className="topbar">
        <div className="brand">BizOps AI {version && <span className="ver">{version}</span>}</div>
        <div className="userbox">
          <span className="pill">{user ? user.role : 'chưa đăng nhập'}</span>
          <span>{user ? `${user.username}${user.employee_code ? ' (' + user.employee_code + ')' : ''}` : ''}</span>
          {user && scope && (
            <span className="pill" title="Phạm vi dữ liệu server-side quyết định">
              {scope.dept_code || scope.dept || '—'} · {scopeText}
            </span>
          )}
          {user && <button className="btn ghost" onClick={logout}>Đăng xuất</button>}
        </div>
      </header>
      {!user ? (
        <main><Login onDone={boot} toast={toast} /></main>
      ) : (
        <>
          <nav className="tabs">
            {TABS.filter((t) => canSeeTab(perms, user && user.role, t.need)).map((t) => (
              <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </nav>
          <p style={{ padding: '0 16px', color: '#64748b', fontSize: 13 }}>
            Vai {user.role} · {perms.length} quyen · phạm vi: {scopeText || '—'} · tab ẩn theo RBAC (backend enforce 403)
          </p>
          <main>
            {tab === 'ceo' && <CeoTab toast={toast} />}
            {tab === 'sales' && <SalesTab toast={toast} />}
            {tab === 'finance' && <FinanceTab toast={toast} />}
            {tab === 'ops' && <OpsTab toast={toast} />}
            {tab === 'cskh' && <CskhTab toast={toast} />}
            {tab === 'marketing' && <MarketingTab toast={toast} />}
            {tab === 'hr' && <HrTab toast={toast} />}
            {tab === 'it' && <ItTab toast={toast} />}
            {tab === 'legal' && <LegalTab toast={toast} />}
            {tab === 'qa' && <QaTab toast={toast} />}
            {tab === 'product' && <ProductTab toast={toast} />}
          </main>
        </>
      )}
      <div id="toast">{toasts.map((t) => <div className="toast" key={t.id}>{t.msg}</div>)}</div>
    </>
  );
}
