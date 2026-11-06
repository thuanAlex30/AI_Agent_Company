// hooks/useStickyCta.js — B2 danh dau <html> khi trang co STICKY CTA (mobile)
// de CSS day noi dung va nang FAB len, tranh CHONG CHAP vung cham (WCAG target-size).
//
// Ly do: Detail.jsx render <div class="sticky-cta"> fixed o day man hinh. Neu
// FAB (nut chat + nut len dau trang) cung fixed o goc phai, chung se CHONG CHAP
// -> Lighthouse audit "target-size" FAIL va nguoi dung khong bam duoc nut.
//
// Cach dung: const hasStickyCta = useStickyCta();  (trong page component)
// -> hook tu gan/tach class 'has-sticky-cta' tren <html> theo vong doi mount.
import { useEffect } from 'react';

export default function useStickyCta(active = true) {
  useEffect(() => {
    const el = document.documentElement;
    if (!el) return undefined;
    if (active) el.classList.add('has-sticky-cta');
    return () => el.classList.remove('has-sticky-cta');
  }, [active]);
}
