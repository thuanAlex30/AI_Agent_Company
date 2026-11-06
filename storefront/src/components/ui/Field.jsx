// components/ui/Field.jsx — B4 Input/Select/Textarea voi nhan noi, loi inline, aria-describedby
import React, { useId } from 'react';

/**
 * Field bao boc nhan (label that) + control + loi inline.
 * - Loi lien ke bang aria-describedby -> screen reader doc duoc.
 * - Loi duoc gan role="alert" -> thong bao loi doc duoc ngay.
 */
export default function Field({
  label, error, hint, required = false, children, className = '', htmlFor, id,
}) {
  const auto = useId();
  const fid = id || htmlFor || auto;
  const errId = error ? `${fid}-err` : undefined;
  const hintId = hint ? `${fid}-hint` : undefined;
  const describedBy = [errId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={'ui-field ' + (error ? 'has-error' : '') + ' ' + className}>
      {label ? (
        <label className="ui-label" htmlFor={fid}>
          {label}
          {required ? <span className="ui-req" aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {React.isValidElement(children)
        ? React.cloneElement(children, {
          id: fid,
          'aria-describedby': describedBy,
          'aria-invalid': error ? 'true' : undefined,
          required: required || undefined,
        })
        : children}
      {hint && !error ? <p className="ui-hint" id={hintId}>{hint}</p> : null}
      {error ? <p className="ui-error" id={errId} role="alert">{error}</p> : null}
    </div>
  );
}

export function Input({ className = '', ...rest }) {
  return <input className={'ui-input ' + className} {...rest} />;
}

export function Textarea({ className = '', ...rest }) {
  return <textarea className={'ui-input ui-textarea ' + className} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
  return (
    <select className={'ui-input ui-select ' + className} {...rest}>
      {children}
    </select>
  );
}
