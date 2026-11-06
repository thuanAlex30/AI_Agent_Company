// components/ui/States.jsx — B4 EmptyState / ErrorState (ErrorState co nut "Thu lai")
import React from 'react';
import Button from './Button.jsx';
import Icon from './Icon.jsx';

/**
 * Tieu de trang khi trang o trang thai rong / loi.
 *
 * SPEC §8 (SEO + WCAG): moi route phai co DUNG MOT <h1>. Khi trang chi render
 * EmptyState/ErrorState thi <h1> that cua trang khong co -> mat H1 -> giam A11y/SEO.
 * Giai phap: them mot <h1> "an" (chi doc cho screen reader) trong <main>.
 * H1 trang that (neu co) van la H1 chinh; khi co h1 an thi KHONG co H1 trang that
 * -> van dung 1 H1.
 */
export function StateHeading({ children }) {
  if (!children) return null;
  return <h1 className="sr-only">{children}</h1>;
}

export function EmptyState({ icon = 'grid', title = 'Chưa có dữ liệu', description, action, heading }) {
  return (
    <div className="ui-state">
      <StateHeading>{heading}</StateHeading>
      <span className="ui-state-ico" aria-hidden="true"><Icon name={icon} size={26} /></span>
      {/* heading-order (WCAG): tieu de trang la <h1> (an, StateHeading) nen tieu de
          state phai la <h2> — h1 -> h3 se bi bao "heading levels should only
          increase by one". CSS .ui-state-title giong hien thi nhu cu. */}
      <h2 className="ui-state-title">{title}</h2>
      {description ? <p className="ui-state-desc">{description}</p> : null}
      {action || null}
    </div>
  );
}

export function ErrorState({ title = 'Không tải được dữ liệu', description, onRetry, retryLabel = 'Thử lại', heading }) {
  return (
    <div className="ui-state ui-state-err" role="alert">
      <StateHeading>{heading}</StateHeading>
      <span className="ui-state-ico" aria-hidden="true"><Icon name="alert" size={26} /></span>
      <h2 className="ui-state-title">{title}</h2>
      {description ? <p className="ui-state-desc">{description}</p> : null}
      {onRetry ? (
        <Button variant="subtle" icon="refresh" onClick={onRetry}>{retryLabel}</Button>
      ) : null}
    </div>
  );
}

/** Banner offline — hien khi navigator.onLine === false */
export function OfflineBanner() {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <Icon name="alert" size={16} /> Bạn đang offline — một số chức năng tạm thời không dùng được.
    </div>
  );
}
