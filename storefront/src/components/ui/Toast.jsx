// components/ui/Toast.jsx — B4 Toast: hang doi, role="status", tu dong dong, nut dong
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const ToastCtx = createContext(null);

const ICONS = { success: 'check', error: 'alert', info: 'info' };

export function ToastProvider({ children, defaultDuration = 4000 }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => {
    setItems((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message, opts = {}) => {
    const id = ++seq.current;
    const duration = opts.duration ?? defaultDuration;
    setItems((t) => [...t, { id, message, tone: opts.tone || 'info', action: opts.action || null }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss, defaultDuration]);

  const api = useMemo(() => {
    // API vua la HAM (toast('...')) vua la OBJECT (toast.success / .error / .info)
    // -> giu tuong thich cho code cu: pages goi toast('Da them ...')
    const fn = (message, opts) => push(message, { ...(opts || {}), tone: 'success' });
    fn.push = push;
    fn.dismiss = dismiss;
    fn.success = (m, o) => push(m, { ...(o || {}), tone: 'success' });
    fn.error = (m, o) => push(m, { ...(o || {}), tone: 'error', duration: (o?.duration ?? 6000) });
    fn.info = (m, o) => push(m, { ...(o || {}), tone: 'info' });
    return fn;
  }, [push, dismiss]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={'toast toast-' + t.tone}>
            <Icon name={ICONS[t.tone] || 'info'} size={18} className="toast-ico" />
            <span className="toast-msg">{t.message}</span>
            {t.action ? (
              <button type="button" className="toast-action" onClick={() => { t.action.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            ) : null}
            <button type="button" className="toast-close" aria-label="Đóng thông báo" onClick={() => dismiss(t.id)}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast phai nam trong <ToastProvider>');
  return ctx;
}

export default ToastProvider;
