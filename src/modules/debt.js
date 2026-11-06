// Công nợ: phân loại + sinh tin nhắn nhắc (AI-ready)
function classifyDebts(db) {
  const rows = db.prepare(`
    SELECT d.*, c.name customer_name, c.phone FROM debts d
    LEFT JOIN customers c ON c.id=d.customer_id WHERE d.status='open'`).all();
  const today = new Date(); today.setHours(0,0,0,0);
  return rows.map(d => {
    const remain = Number(d.amount) - Number(d.paid || 0);
    const due = d.due_date ? new Date(d.due_date) : null;
    const diff = due ? Math.round((due - today) / 86400000) : 999;
    const bucket = diff < 0 ? 'overdue' : diff <= 3 ? 'due_soon' : 'normal';
    return { ...d, remain, overdue_days: diff < 0 ? -diff : 0, bucket };
  });
}

function buildReminderMessage(debt, company = process.env.COMPANY_NAME || 'Công ty') {
  const fmt = n => Number(n).toLocaleString('vi-VN') + 'đ';
  const tone = debt.bucket === 'overdue'
    ? `Khoản ${fmt(debt.remain)} đã quá hạn ${debt.overdue_days} ngày`
    : `Khoản ${fmt(debt.remain)} đến hạn ${debt.due_date}`;
  return `Xin chào ${debt.customer_name || 'Quý khách'}, ${company} xin nhắc ${tone} (đơn ${debt.order_id || ''}). Quý khách vui lòng thanh toán sớm. Cần hỗ trợ/hóa đơn xin phản hồi tin này. Cảm ơn!`;
}

module.exports = { classifyDebts, buildReminderMessage };
