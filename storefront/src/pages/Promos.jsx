import { useEffect, useState } from 'react';
import { getPromos } from '../services/api.js';
export default function Promos() {
  const [items, setItems] = useState(null);
  useEffect(() => { getPromos().then(setItems).catch(() => setItems([])); }, []);
  return (
    <><h2>Khuyến mãi</h2>
      {!items && <div className="card"><div className="skel"> </div></div>}
      {items && items.length === 0 && <div className="alert">Chưa có chương trình. Theo dõi fanpage/Zalo OA nhé.</div>}
      {items && <div className="grid">{items.map((m) => <div className="card" key={m.code}><span className="pill sale">{m.code}</span><h3>{m.title}</h3><p>{m.description}</p><p style={{ color: '#6b7280' }}>{m.start_date || ''} → {m.end_date || ''}</p></div>)}</div>}
    </>
  );
}
