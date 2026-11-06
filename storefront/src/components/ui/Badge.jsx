// components/ui/Badge.jsx — B4 Badge/Pill
import React from 'react';

const TONES = {
  neutral: 'bd-neutral', ok: 'bd-ok', warn: 'bd-warn', err: 'bd-err',
  info: 'bd-info', sale: 'bd-sale', brand: 'bd-brand',
};

export default function Badge({ children, tone = 'neutral', className = '', ...rest }) {
  return (
    <span className={'ui-badge ' + (TONES[tone] || TONES.neutral) + ' ' + className} {...rest}>
      {children}
    </span>
  );
}
