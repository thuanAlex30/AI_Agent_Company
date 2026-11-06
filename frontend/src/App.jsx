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

function canSeeTab(perms, role, need) {
  if (role === 'owner' || role === 'ceo') return true;
  return (need || []).some((p) => perms.includes(p));
}

export default function App() {
  const [user, setUser] = useState(null);
  const [perms, setPerms] = useState([]);
  const [tab, setTab] = useState('ceo');
  const [toasts, setToasts] = useState([]);

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
      // neu tab hien tai khong co quyen -> chuyen ve tab dau tien duoc phep
      const role = data.user && data.user.role;
      const allowed = TABS.filter((t) => canSeeTab(data.permissions || [], role, t.need));
      if (allowed.length && !allowed.some((t) => t.id === tab)) setTab(allowed[0].id);
    } catch {
      setUser(null);
      setPerms([]);
    }
  }
  useEffect(() => { boot(); }, []);

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch {}
    setUser(null);
  }

  return (
    <>
      <header className="topbar">
        <div className="brand">BizOps AI <span className="ver">v6.1</span></div>
        <div className="userbox">
          <span className="pill">{user ? user.role : 'chưa đăng nhập'}</span>
          <span>{user ? `${user.username}${user.employee_code ? ' (' + user.employee_code + ')' : ''}` : ''}</span>
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
          <p style={{ padding: '0 16px', color: '#64748b', fontSize: 13 }}>Vai {user.role} · {perms.length} quyen · tab an theo RBAC (backend enforce 403)</p>
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
