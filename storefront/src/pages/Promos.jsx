import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPromos } from '../services/api.js';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import { SkeletonCard } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/States.jsx';
import usePageMeta from '../hooks/usePageMeta.js';

function isActive(m) {
  const t = new Date().toISOString().slice(0, 10);
  if (m.start_date && m.start_date > t) return false;
  if (m.end_date && m.end_date < t) return false;
  return true;
}

function PromoCard({ m, active }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(m.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }
  return (
    <article className="card promo-card">
      <div className="promo-head">
        <Badge tone={active ? 'sale' : 'neutral'}>{m.code}</Badge>
        {active ? <Badge tone="ok">Đang chạy</Badge> : null}
      </div>
      {/* heading-order (WCAG): trang co <h1> nen tieu de the goi phai la <h2> */}
      <h2 className="ck-h">{m.title}</h2>
      <p>{m.description}</p>
      <p className="promo-dates">
        <Icon name="clock" size={14} /> {m.start_date || ''} → {m.end_date || 'khi có TB mới'}
      </p>
      <div className="row">
        <Button size="sm" variant="ghost" icon="copy" onClick={copy}>
          {copied ? 'Đã sao chép' : 'Sao chép mã'}
        </Button>
        {active ? <Link className="ui-btn btn-primary ui-btn-sm" to="/san-pham">Dùng ngay →</Link> : null}
      </div>
    </article>
  );
}

export default function Promos() {
  const [items, setItems] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  usePageMeta('Khuyến mãi', 'Các chương trình khuyến mãi đang chạy tại BizOps Café.');

  useEffect(() => {
    setItems(null);
    getPromos().then(setItems).catch(() => setItems([]));
  }, [reloadKey]);

  const act = (items || []).filter(isActive);
  const soon = (items || []).filter((m) => !isActive(m));

  return (
    <>
      <p className="crumb"><Link to="/">Cửa hàng</Link> / Khuyến mãi</p>
      <div className="sechd">
        <h1 className="page-h1">Khuyến mãi</h1>
        <span style={{ color: 'var(--ink-400)' }}>{act.length} đang chạy</span>
      </div>

      {!items ? <div className="grid">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div> : null}

      {items && items.length === 0 ? (
        <EmptyState
          icon="tag"
          title="Chưa có chương trình"
          description="Theo dõi fanpage/Zalo OA hoặc hỏi chat góc phải nhé."
          action={<Button variant="ghost" icon="refresh" onClick={() => setReloadKey((k) => k + 1)}>Tải lại</Button>}
        />
      ) : null}

      {act.length > 0 ? <div className="grid">{act.map((m) => <PromoCard key={m.code} m={m} active />)}</div> : null}

      {soon.length > 0 ? (
        <>
          <h2 className="section-h2">Sắp tới / vừa hết</h2>
          <div className="grid">{soon.map((m) => <PromoCard key={m.code} m={m} active={false} />)}</div>
        </>
      ) : null}

      <div className="card trust" style={{ marginTop: 'var(--s-5)' }}>
        <strong>Lưu ý giá theo giờ</strong>
        <p>Web 7h–9h cà phê sữa còn 32k, combo sáng tiết kiệm — giá server quyết định lúc checkout, không cần nhập mã.</p>
      </div>
    </>
  );
}
