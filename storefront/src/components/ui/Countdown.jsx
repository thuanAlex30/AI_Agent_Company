// components/ui/Countdown.jsx — B4 Countdown flash-sale: tabular-nums, KHONG animate so,
// chi doi mau khi < 1 gio (khong truyen thong tin chi bang mau).
import React, { useEffect, useState } from 'react';

function diffTo(endTs) {
  const ms = endTs - Date.now();
  if (ms <= 0) return { h: 0, m: 0, s: 0, done: true };
  return {
    h: Math.floor(ms / 3600000),
    m: Math.floor((ms % 3600000) / 60000),
    s: Math.floor((ms % 60000) / 1000),
    done: false,
  };
}

export default function Countdown({ until, onEnd, className = '' }) {
  const target = typeof until === 'number' ? until : new Date(until).getTime();
  const [t, setT] = useState(() => diffTo(target));

  useEffect(() => {
    const id = setInterval(() => {
      const n = diffTo(target);
      setT(n);
      if (n.done) { clearInterval(id); onEnd?.(); }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onEnd]);

  const pad = (n) => String(n).padStart(2, '0');
  const urgent = !t.done && t.h === 0;

  return (
    <span className={'ui-countdown ' + (urgent ? 'is-urgent' : '') + ' ' + className} role="timer" aria-live="off">
      <span className="ui-cd-cell"><b>{pad(t.h)}</b><i>giờ</i></span>
      <span className="ui-cd-sep" aria-hidden="true">:</span>
      <span className="ui-cd-cell"><b>{pad(t.m)}</b><i>phút</i></span>
      <span className="ui-cd-sep" aria-hidden="true">:</span>
      <span className="ui-cd-cell"><b>{pad(t.s)}</b><i>giây</i></span>
      {t.done ? <span className="ui-cd-done">Đã kết thúc</span> : null}
    </span>
  );
}
