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

const GROUPS = [
  {
    name: 'Tổng quan',
    items: [{ id: 'ceo', label: 'CEO', need: ['orders.read'] }],
  },
  {
    name: 'Kinh doanh',
    items: [
      { id: 'sales', label: 'Sales', need: ['orders.write', 'leads.write'] },
      { id: 'marketing', label: 'Marketing', need: ['campaigns.write'] },
      { id: 'cskh', label: 'CSKH', need: ['tickets.write', 'chat.write'] },
    ],
  },
  {
    name: 'Vận hành',
    items: [
      { id: 'ops', label: 'Ops / Kho', need: ['stock.write', 'shipments.write', 'po.write'] },
      { id: 'finance', label: 'Finance', need: ['finance.read', 'payments.write'] },
      { id: 'product', label: 'Product', need: ['productfeat.write', 'sop.write'] },
      { id: 'qa', label: 'QA', need: ['qa.write'] },
    ],
  },
  {
    name: 'Hỗ trợ & Quản trị',
    items: [
      { id: 'hr', label: 'HR', need: ['hr.read', 'employees.write'] },
      { id: 'it', label: 'IT', need: ['it.write'] },
      { id: 'legal', label: 'Legal', need: ['approvals.read', 'audit.read', 'risks.write'] },
    ],
  },
];

const TITLES = {
  ceo: 'Tổng quan CEO', sales: 'Kinh doanh', finance: 'Tài chính', ops: 'Kho & Vận hành',
  cskh: 'Chăm sóc khách hàng', marketing: 'Marketing', hr: 'Nhân sự', it: 'Công nghệ',
  legal: 'Pháp chế & Kiểm soát', qa: 'Chất lượng', product: 'Sản phẩm',
};

// Khớp backend (`requirePerm` cần ĐỦ quyền của tab). `.some()` trước đây
// chỉ cần 1 quyền là đủ => hiện tab nhưng backend 403.
export function canSeeTab(perms, role, need) {
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
  const [navOpen, setNavOpen] = useState(false);

  function toast(msg, kind) {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }

  async function boot() {
    try {
      const data = await api('/api/auth/me');
      setUser(data.user);
      setPerms(data.permissions || []);
      // Hiển thị phạm vi scope server trả về — server vẫn là nơi quyết định.
      setScope(data.scope || null);
      const role = data.user && data.user.role;
      const all = GROUPS.flatMap((g) => g.items);
      const allowed = all.filter((t) => canSeeTab(data.permissions || [], role, t.need));
      if (allowed.length && !allowed.some((t) => t.id === tab)) setTab(allowed[0].id);
    } catch {
      setUser(null);
      setPerms([]);
      setScope(null);
    }
  }

  useEffect(() => { boot(); }, []);

  // Version từ /api/health (không hardcode trong UI).
  useEffect(() => {
    let alive = true;
    fetch('/api/health').then((r) => r.json()).then((b) => {
      if (!alive || !b || !b.ok) return;
      const v = (b.data && (b.data.version || b.data.app_version)) || '';
      if (v) setVersion(v);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Nghe `auth:expired` (api.js phát khi refresh thất bại).
  useEffect(() => {
    function onExpired() {
      setUser(null);
      setPerms([]);
      setScope(null);
      toast('Phiên đăng nhập đã hết, vui lòng đăng nhập lại', 'err');
    }
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* logout luôn clear FE */ }
    setUser(null);
    setPerms([]);
    setScope(null);
  }

  function goto(id) {
    setTab(id);
    setNavOpen(false);
  }

  if (!user) {
    return (
      <>
        <a className="skip-link" href="#main">Bỏ qua tới nội dung</a>
        <main id="main" className="erp-content"><Login onDone={boot} toast={toast} /></main>
        <div id="toast" aria-live="polite">{toasts.map((t) => <div className={'toast' + (t.kind ? ' ' + t.kind : '')} key={t.id}>{t.msg}</div>)}</div>
      </>
    );
  }

  const role = user.role;
  const visibleGroups = GROUPS
    .map((g) => ({ ...g, items: g.items.filter((t) => canSeeTab(perms, role, t.need)) }))
    .filter((g) => g.items.length);
  const scopeText = scope
    ? (scope.all_depts ? 'toàn công ty' : (scope.depts === 'ALL' ? 'toàn công ty' : (scope.depts || []).join(', ')))
    : '';

  return (
    <div className={'erp' + (navOpen ? ' open' : '')}>
      <a className="skip-link" href="#main">Bỏ qua tới nội dung</a>
      <aside className="erp-side" aria-label="Điều hướng ERP">
        <div className="erp-brand"><b>BizOps AI</b>{version && <span className="ver">{version}</span>}</div>
        <nav className="erp-nav">
          {visibleGroups.map((g) => (
            <div key={g.name}>
              <div className="erp-nav-group">{g.name}</div>
              {g.items.map((t) => (
                <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => goto(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="erp-side-foot">Vai {role} · {perms.length} quyền · tab ẩn theo RBAC (backend enforce 403)</div>
      </aside>

      <div className="erp-main">
        <header className="erp-top">
          <button className="btn ghost small menu-btn" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen} aria-label="Mở menu điều hướng">☰</button>
          <h1>{TITLES[tab] || 'BizOps AI'}</h1>
          <div className="erp-user">
            <span className="pill">{role}</span>
            <span style={{ fontSize: '.85rem' }}>{user.username}{user.employee_code ? ' (' + user.employee_code + ')' : ''}</span>
            {scope && (
              <span className="pill" title="Phạm vi dữ liệu do server quyết định">
                {scope.dept_code || scope.dept || '—'} · {scopeText || '—'}
              </span>
            )}
            <button className="btn ghost small" onClick={logout}>Đăng xuất</button>
          </div>
        </header>
        <main id="main" className="erp-content" tabIndex={-1}>
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
      </div>

      {navOpen && <button className="scrim" aria-label="Đóng menu" onClick={() => setNavOpen(false)} />}
      <div id="toast" aria-live="polite">{toasts.map((t) => <div className={'toast' + (t.kind ? ' ' + t.kind : '')} key={t.id}>{t.msg}</div>)}</div>
    </div>
  );
}
