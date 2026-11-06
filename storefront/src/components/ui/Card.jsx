// components/ui/Card.jsx — B4 Card + hover nang (chi transform/opacity)
import React from 'react';

export default function Card({ children, hover = false, as: As = 'div', className = '', ...rest }) {
  return (
    <As className={'ui-card ' + (hover ? 'ui-card-hover' : '') + ' ' + className} {...rest}>
      {children}
    </As>
  );
}
