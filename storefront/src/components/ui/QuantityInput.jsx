// components/ui/QuantityInput.jsx — B4 QuantityInput (vung cham >= 44px, nhan cho may doc)
import React from 'react';
import Icon from './Icon.jsx';

export default function QuantityInput({ value = 1, onChange, min = 1, max = 99, label = 'Số lượng', disabled = false }) {
  const clamp = (n) => Math.max(min, Math.min(max, Number(n) || min));
  const set = (n) => { const v = clamp(n); if (v !== value) onChange?.(v); };
  return (
    <div className="ui-qty" role="group" aria-label={label}>
      <button type="button" className="ui-qty-btn" onClick={() => set(value - 1)} disabled={disabled || value <= min} aria-label="Giảm số lượng">
        <Icon name="minus" size={16} />
      </button>
      <input
        className="ui-qty-input"
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => set(e.target.value)}
      />
      <button type="button" className="ui-qty-btn" onClick={() => set(value + 1)} disabled={disabled || value >= max} aria-label="Tăng số lượng">
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
