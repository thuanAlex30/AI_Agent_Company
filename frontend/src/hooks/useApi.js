import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Chuẩn hoá trạng thái tải dữ liệu cho mọi tab ERP.
 * Không retry vô hạn, không nuốt lỗi thành dữ liệu rỗng.
 */
export function useQuery(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await loader();
      if (alive.current) setData(out ?? null);
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  return { data, loading, error, reload, setData };
}

export function errKind(e) {
  if (!e) return 'unknown';
  if (e.status === 401 || e.code === 'AUTH_EXPIRED') return 'unauthorized';
  if (e.status === 403) return 'forbidden';
  return 'error';
}

export function errText(e) {
  if (!e) return 'Đã xảy ra lỗi.';
  const k = errKind(e);
  if (k === 'unauthorized') return 'Phiên đăng nhập đã hết. Vui lòng đăng nhập lại.';
  if (k === 'forbidden') return 'Bạn không có quyền xem dữ liệu này (backend từ chối 403).';
  return e.message || 'Không tải được dữ liệu.';
}
