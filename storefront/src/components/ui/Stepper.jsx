// components/ui/Stepper.jsx — B4 Stepper (Checkout 3 buoc)
import React from 'react';

export default function Stepper({ steps = [], current = 0 }) {
  return (
    <ol className="ui-stepper" aria-label="Tiến trình đặt hàng">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s.key || s.label || i} className={'ui-step ui-step-' + state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="ui-step-num" aria-hidden="true">{i + 1}</span>
            <span className="ui-step-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
