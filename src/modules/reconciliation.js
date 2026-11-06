// Đối soát: match transactions <-> orders theo amount + date gần nhau + từ khóa nội dung
function normalize(s = '') {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function runReconciliation(db) {
  const txs = db.prepare("SELECT * FROM transactions WHERE status='unmatched'").all();
  const orders = db.prepare("SELECT o.*, c.code ccode, c.name cname FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.status!='paid'").all();
  let matched = 0;
  const details = [];
  const updTx = db.prepare('UPDATE transactions SET matched_order_id=?, status=? WHERE id=?');
  const updOrder = db.prepare('UPDATE orders SET status=? WHERE id=?');

  for (const t of txs) {
    const tNorm = normalize(t.content || '');
    let best = null, bestScore = 0;
    for (const o of orders) {
      let score = 0;
      if (Math.abs(Number(t.amount) - Number(o.amount)) < 1000) score += 50;
      else if (Math.abs(Number(t.amount) - Number(o.amount)) / Number(o.amount) < 0.01) score += 30;
      const d1 = new Date(t.trans_date), d2 = new Date(o.order_date);
      const diffDays = Math.abs((d1 - d2) / 86400000);
      if (diffDays <= 3) score += 20; else if (diffDays <= 7) score += 10;
      if (o.code && tNorm.includes(normalize(o.code))) score += 30;
      if (o.ccode && tNorm.includes(normalize(o.ccode))) score += 15;
      if (score > bestScore) { bestScore = score; best = o; }
    }
    if (best && bestScore >= 50) {
      updTx.run(best.id, 'matched', t.id);
      updOrder.run('paid', best.id);
      // tự trừ công nợ liên quan
      db.prepare('UPDATE debts SET paid = amount, status="done" WHERE order_id=?').run(best.id);
      matched++;
      details.push({ tx: t.id, order: best.code, score: bestScore });
    }
  }
  const left = db.prepare("SELECT COUNT(*) v FROM transactions WHERE status='unmatched'").get().v;
  return { matched, unmatched: left, details };
}

module.exports = { runReconciliation };
