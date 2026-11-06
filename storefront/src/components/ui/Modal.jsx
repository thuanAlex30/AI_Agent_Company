// components/ui/Modal.jsx — B4 Modal/Drawer: focus trap, Esc dong, khoa cuon nen, tra focus
import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * @param {boolean} open
 * @param {()=>void} onClose
 * @param {'modal'|'drawer'} variant
 */
export default function Modal({ open, onClose, title, children, footer, variant = 'modal', labelledBy = 'modal-title' }) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return; }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus phai element dau tien trong panel (de luon co focus trap)
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector(FOCUSABLE) || panel;
      target.focus({ preventScroll: true });
    }, 0);

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      const r = restoreRef.current;
      if (r && typeof r.focus === 'function') r.focus({ preventScroll: true });
    };
  }, [open, onKeyDown]);

  if (!open) return null;

  return createPortal(
    <div className={'ui-overlay ui-overlay-' + variant} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div
        className={'ui-panel ui-panel-' + variant}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        ref={panelRef}
        tabIndex={-1}
      >
        <header className="ui-panel-head">
          <h2 id={labelledBy} className="ui-panel-title">{title}</h2>
          <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </header>
        <div className="ui-panel-body">{children}</div>
        {footer ? <footer className="ui-panel-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}
