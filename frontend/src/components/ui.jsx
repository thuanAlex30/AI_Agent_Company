import { useEffect, useRef, useState } from 'react';
import { errText } from '../hooks/useApi.js';

/* ---------- Page header ---------- */
export function PageHeader({ title, desc, actions }) {
  return (
    <div className="sechd" style={{ marginBottom: 16 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.35rem' }}>{title}</h2>
        {desc && <p style={{ margin: '4px 0 0', color: 'var(--ink-400)', fontSize: '.9rem' }}>{desc}</p>}
      </div>
      {actions && <div className="btn-row">{actions}</div>}
    </div>
  );
}

/* ---------- Section card ---------- */
export function SectionCard({ title, desc, actions, children }) {
  return (
    <section className="card" aria-label={title}>
      <div className="sechd">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          {desc && <p style={{ margin: '2px 0 0', color: 'var(--ink-400)', fontSize: '.85rem' }}>{desc}</p>}
        </div>
        {actions && <div className="btn-row">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/* ---------- Status badge: khong chi dung mau, co text ---------- */
const TONE = {
  ok: 'ok', success: 'ok', done: 'ok', pass: 'ok', resolved: 'ok', approved: 'ok', active: 'ok', matched: 'ok', present: 'ok',
  warn: 'warn', pending: 'warn', processing: 'warn', fixing: 'warn', shipping: 'warn', normal: 'warn', medium: 'warn',
  err: 'err', bad: 'err', fail: 'err', failed: 'err', rejected: 'err', urgent: 'err', critical: 'err', high: 'err', p1: 'err',
  info: 'info', low: 'info', easy: 'info', idea: 'info', spec: 'info',
};
export function StatusBadge({ value, tone }) {
  const v = String(value ?? '—');
  const t = tone || TONE[v.toLowerCase()] || 'neutral';
  return <span className={'badge ' + t}>{v}</span>;
}

/* ---------- Data states ---------- */
export function LoadingState({ label = 'Đang tải dữ liệu…' }) {
  return (
    <div className="state" role="status" aria-live="polite" aria-label={label}>
      <div className="skel" style={{ width: '100%' }} aria-hidden="true"><i /><i style={{ width: '80%' }} /><i style={{ width: '60%' }} /></div>
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Chưa có dữ liệu', hint, action }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {hint && <span style={{ fontSize: '.9rem' }}>{hint}</span>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const forbidden = error && (error.status === 403);
  return (
    <div className="alert err" role="alert">
      <div style={{ flex: 1 }}>
        <strong>{forbidden ? 'Không có quyền truy cập' : 'Không tải được dữ liệu'}</strong>
        <div>{errText(error)}</div>
        {error && error.code && <div style={{ fontSize: '.8rem', opacity: .8 }}>Mã lỗi: {String(error.code)}</div>}
      </div>
      {onRetry && <button className="btn small ghost" onClick={onRetry}>Thử lại</button>}
    </div>
  );
}

/* ---------- Form field ---------- */
export function FormField({ label, hint, error, children, htmlFor }) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
      {error && <span className="ferr" role="alert">{error}</span>}
    </label>
  );
}

/* ---------- Data table ---------- */
export function DataTable({ caption, columns, rows, keyOf, empty }) {
  if (!rows || !rows.length) {
    return <EmptyState title={empty?.title || 'Chưa có dữ liệu'} hint={empty?.hint} action={empty?.action} />;
  }
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        {caption && <caption>{caption}</caption>}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col">{c.head}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={keyOf ? keyOf(r, i) : (r.id ?? i)}>
              {columns.map((c) => <td key={c.key}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Confirm dialog (focus trap co ban + Esc) ---------- */
export function ConfirmDialog({ open, title, body, confirmLabel = 'Xác nhận', onCancel, onConfirm, busy }) {
  const okRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    okRef.current?.focus();
    function onKey(e) { if (e.key === 'Escape') onCancel?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="dlg-scrim" onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <div className="dlg" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div>{typeof body === 'string' ? <p>{body}</p> : body}</div>
        <div className="dlg-foot">
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Hủy</button>
          <button ref={okRef} className="btn" onClick={onConfirm} disabled={busy}>{busy ? 'Đang gửi…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Mutation hook: chong double-submit (khong thay idempotency backend) ---------- */
export function useMutation(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function run(...args) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const out = await fn(...args);
      return out;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}
