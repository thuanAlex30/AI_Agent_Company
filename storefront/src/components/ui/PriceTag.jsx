// components/ui/PriceTag.jsx — B4 PriceTag: gia goc gach + gia sale
import React from 'react';
import { fmtNumber } from '../../utils/format.js';

export default function PriceTag({ price, originalPrice = null, size = 'md', className = '' }) {
  const hasSale = originalPrice != null && Number(originalPrice) > Number(price);
  const off = hasSale ? Math.round((1 - Number(price) / Number(originalPrice)) * 100) : 0;
  return (
    <span className={'ui-price ui-price-' + size + ' ' + className}>
      <span className="ui-price-now">{fmtNumber(price)}đ</span>
      {hasSale ? (
        <>
          <s className="ui-price-old">{fmtNumber(originalPrice)}đ</s>
          <span className="ui-price-off">-{off}%</span>
        </>
      ) : null}
    </span>
  );
}
