// Agent điều phối đa phòng ban — mỗi phòng ban là 1 plugin trả về overview + alert
const { classifyDebts } = require('./debt');

const departments = {
  sales: (db) => {
    const r = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount),0) t FROM orders WHERE order_date >= date('now','-30 days')").get();
    return { kpi: `${r.n} đơn / ${Number(r.t).toLocaleString('vi-VN')}đ (30 ngày)`, alerts: r.n === 0 ? ['30 ngày không có đơn mới'] : [] };
  },
  accounting: (db) => {
    const d = classifyDebts(db);
    const od = d.filter(x => x.bucket === 'overdue');
    const sum = od.reduce((s, x) => s + x.remain, 0);
    return { kpi: `${od.length} khoản quá hạn / ${sum.toLocaleString('vi-VN')}đ`, alerts: od.map(x => `${x.customer_name}: ${x.remain.toLocaleString('vi-VN')}đ quá ${x.overdue_days} ngày`) };
  },
  inventory: (db) => {
    const low = db.prepare('SELECT * FROM inventory WHERE qty < 10').all();
    return { kpi: `${low.length} SKU sắp hết`, alerts: low.map(x => `${x.sku} còn ${x.qty}`) };
  },
  hr: () => ({ kpi: 'Chưa kết nối chấm công', alerts: ['Gợi ý: thêm module chấm công ở phase 2'] }),
  marketing: (db) => {
    const t = db.prepare("SELECT COUNT(*) n FROM tickets WHERE created_at >= date('now','-7 days')").get().n;
    return { kpi: `${t} ticket CSKH / 7 ngày`, alerts: t > 5 ? ['Ticket tăng, nên chạy chiến dịch xin review'] : [] };
  }
};

function overview(db) {
  const out = {};
  for (const [k, fn] of Object.entries(departments)) { try { out[k] = fn(db); } catch (e) { out[k] = { kpi: 'lỗi', alerts: [e.message] }; } }
  // Agent gợi ý việc ưu tiên mỗi sáng
  const pri = [];
  if (out.accounting?.alerts?.length) pri.push('1. Xử lý công nợ quá hạn trước 10h');
  if (out.inventory?.alerts?.length) pri.push('2. Nhập thêm hàng sắp hết');
  pri.push('3. Check ticket CSKH mở');
  out.agent_suggestion = pri;
  return out;
}

module.exports = { overview };
