// components/ui/Button.jsx — B4 Button (primary/ghost/subtle/icon) + loading
import React from 'react';
import Icon from './Icon.jsx';

const VARIANTS = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  subtle: 'btn-subtle',
  link: 'btn-link',
};

export default function Button({
  children, variant = 'primary', size = 'md', icon = null, iconRight = null,
  loading = false, disabled = false, full = false, type = 'button', className = '', ...rest
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      className={[
        'ui-btn', VARIANTS[variant] || VARIANTS.primary,
        size === 'sm' ? 'ui-btn-sm' : size === 'lg' ? 'ui-btn-lg' : '',
        full ? 'ui-btn-full' : '', isDisabled ? 'is-disabled' : '', className,
      ].filter(Boolean).join(' ')}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : (icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null)}
      {children ? <span className="ui-btn-label">{children}</span> : null}
      {!loading && iconRight ? <Icon name={iconRight} size={size === 'sm' ? 16 : 18} /> : null}
    </button>
  );
}
