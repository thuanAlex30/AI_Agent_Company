// hooks/useReveal.js — B2 hien dan khi cuon: dung MOT IntersectionObserver dung chung,
// so le toi da 5 phan tu, chi chay MOT LAN, tat khi prefers-reduced-motion.
import { useEffect, useRef } from 'react';

let observer = null;
const pending = new Set();
let scheduled = false;

function getObserver() {
  if (observer) return observer;
  observer = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      el.classList.add('is-revealed');
      pending.delete(el);
      observer.unobserve(el);
    }
    // So le toi da 5 → giai phong hang doi
    if (pending.size > 5) {
      const extra = [...pending].slice(0, pending.size - 5);
      extra.forEach((el) => { pending.delete(el); observer.unobserve(el); });
    }
    if (!pending.size) scheduled = false;
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  return observer;
}

function flush() {
  const io = getObserver();
  const list = [...pending];
  pending.clear();
  list.forEach((el) => io.observe(el));
  scheduled = false;
}

/**
 * Hook tra ve ref gan vao phan tu can hien dan.
 * @param {{threshold?:number, once?:boolean}} [opts]
 */
export default function useReveal(opts = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    // Reduced motion: hien ngay, khong can observer
    const reduce = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { el.classList.add('is-revealed'); return undefined; }

    if (!('IntersectionObserver' in window)) { el.classList.add('is-revealed'); return undefined; }

    pending.add(el);
    if (!scheduled) { scheduled = true; requestAnimationFrame(flush); }

    return () => { pending.delete(el); };
  }, []);

  return ref;
}
