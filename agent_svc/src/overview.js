// overview read-only cho agent_svc — tong hop 12 khoi tu DB chung (khong ghi, khong cron).
// Moi khoi try/catch rieng — 1 khoi loi khong sap overview.
const { todayVN } = require('./db');

async function safe(fn) {
  try { return await fn(); }
  catch (e) { return { status: 'error', message: String(e.message || e).slice(0, 120) }; }
}

async function getOverview(conn) {
  const db = require('./db');
  const c = (conn && conn.run) ? conn : db;
  const out = {};

  out.ceo = await safe(async () => {
    const emp = await c.get("SELECT COUNT(*) c FROM employees WHERE status IN ('active','probation')");
    const rev = await c.get("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE order_date >= date('now','-30 days') AND status NOT IN ('cancelled','refunded','draft')");
    const appr = await c.get("SELECT COUNT(*) c FROM approvals WHERE status='pending'");
    return { headcount: Number(emp?.c || 0), revenue30d: Number(rev?.s || 0), approvals_pending: Number(appr?.c || 0) };
  });

  out.sales = await safe(async () => {
    const rev = await c.get("SELECT COALESCE(SUM(amount),0) s, COUNT(*) co FROM orders WHERE order_date >= date('now','-30 days') AND status NOT IN ('cancelled','refunded','draft')");
    const won = await c.get("SELECT COUNT(*) c FROM leads WHERE stage='won'");
    const lost = await c.get("SELECT COUNT(*) c FROM leads WHERE stage='lost'");
    const w = Number(won?.c || 0), l = Number(lost?.c || 0);
    const win_rate = (w + l) ? Math.round(w / (w + l) * 1000) / 10 : 0;
    const r1 = await c.get('SELECT COUNT(DISTINCT customer_id) c FROM orders WHERE status NOT IN (\'cancelled\',\'refunded\',\'draft\')');
    const r2 = await c.get('SELECT COUNT(*) c FROM (SELECT customer_id FROM orders WHERE status NOT IN (\'cancelled\',\'refunded\',\'draft\') GROUP BY customer_id HAVING COUNT(*) >= 2)');
    const retention = Number(r1?.c || 0) ? Math.round(Number(r2?.c || 0) / Number(r1.c) * 1000) / 10 : 0;
    return { revenue30d: Number(rev?.s || 0), orders30d: Number(rev?.co || 0), win_rate, retention };
  });

  out.marketing = await safe(async () => {
    const rows = await c.query('SELECT * FROM v_campaign_roi');
    const leads = rows.reduce((s, r) => s + Number(r.leads || 0), 0);
    const orders = rows.reduce((s, r) => s + Number(r.orders || 0), 0);
    const cost = rows.reduce((s, r) => s + Number(r.cost || 0), 0);
    return { campaigns: rows.length, leads, orders, cost };
  });

  out.cskh = await safe(async () => {
    const open = await c.get("SELECT COUNT(*) c FROM tickets WHERE status IN ('open','processing')");
    const breach = await c.get('SELECT COUNT(*) c FROM v_sla_breach');
    const csat = await c.get('SELECT AVG(stars) a, COUNT(*) c FROM ratings');
    const res = await c.get("SELECT COUNT(*) c, COALESCE(SUM(reopen_count),0) s FROM tickets WHERE status IN ('resolved','closed')");
    const rc = Number(res?.c || 0), rs = Number(res?.s || 0);
    const fcr = rc ? Math.round((rc - Math.min(rs, rc)) / rc * 1000) / 10 : 100;
    return { open: Number(open?.c || 0), sla_breach: Number(breach?.c || 0), csat_avg: csat?.a ? Math.round(Number(csat.a) * 100) / 100 : 0, fcr };
  });

  out.ops = await safe(async () => {
    const alerts = await c.query('SELECT p.sku, COALESCE((SELECT SUM(qty) FROM stock_moves s WHERE s.product_sku=p.sku),0) AS stock, p.stock_alert FROM products p');
    const low = alerts.filter((r) => Number(r.stock) <= Number(r.stock_alert)).length;
    const ship = await c.get("SELECT COUNT(*) c FROM shipments WHERE status IN ('pending','shipping')");
    const sop = await c.get("SELECT COUNT(*) c FROM sop_tasks WHERE status='overdue'");
    return { stock_low: low, shipments_open: Number(ship?.c || 0), sop_overdue: Number(sop?.c || 0) };
  });

  out.supply = await safe(async () => {
    const po = await c.get("SELECT COUNT(*) c FROM purchase_orders WHERE status IN ('draft','pending_approval','approved','sent')");
    const sup = await c.get('SELECT COUNT(*) c FROM suppliers');
    return { po_open: Number(po?.c || 0), suppliers: Number(sup?.c || 0) };
  });

  out.finance = await safe(async () => {
    const ar = await c.get("SELECT COALESCE(SUM(amount-paid),0) s FROM debts WHERE type='receivable' AND status IN ('open','overdue')");
    const rev = await c.get("SELECT COALESCE(SUM(amount),0) s FROM orders WHERE order_date >= date('now','-30 days') AND status NOT IN ('cancelled','refunded','draft')");
    const rev30 = Number(rev?.s || 0);
    const dso = rev30 > 0 ? Number(ar?.s || 0) / (rev30 / 30) : 0;
    const cash = await c.get('SELECT COALESCE(SUM(CASE WHEN debt_id IS NOT NULL THEN amount ELSE 0 END),0) thu, COALESCE(SUM(CASE WHEN expense_id IS NOT NULL THEN amount ELSE 0 END),0) chi FROM payments');
    return { ar: Number(ar?.s || 0), revenue30d: rev30, dso: Math.round(dso * 10) / 10, thu: Number(cash?.thu || 0), chi: Number(cash?.chi || 0) };
  });

  out.hr = await safe(async () => {
    const total = await c.get("SELECT COUNT(*) c FROM employees WHERE status IN ('active','probation')");
    const left = await c.get("SELECT COUNT(*) c FROM employees WHERE left_date IS NOT NULL AND left_date >= date('now','-30 days')");
    const t = Number(total?.c || 0);
    const turnover = t ? Math.round(Number(left?.c || 0) / t * 1000) / 10 : 0;
    const today = todayVN();
    const present = await c.get("SELECT COUNT(*) c FROM attendance WHERE work_date=? AND status IN ('present','late')", [today]);
    return { headcount: t, turnover_30d: turnover, present_today: Number(present?.c || 0) };
  });

  out.it = await safe(async () => {
    const open = await c.get("SELECT COUNT(*) c FROM it_incidents WHERE status IN ('open','fixing')");
    const p1 = await c.get("SELECT COUNT(*) c FROM it_incidents WHERE severity='p1' AND status IN ('open','fixing')");
    const mttr = await c.get('SELECT AVG(mttr_min) a FROM it_incidents WHERE mttr_min IS NOT NULL');
    const uptime = Math.max(90, 100 - Number(p1?.c || 0) * 0.5 - Number(open?.c || 0) * 0.05);
    return { open: Number(open?.c || 0), p1_open: Number(p1?.c || 0), mttr_min: mttr?.a ? Math.round(Number(mttr.a)) : null, uptime_estimate: Math.round(uptime * 100) / 100, note: 'uptime uoc tinh tu incidents (khong phai monitoring that)' };
  });

  out.legal = await safe(async () => {
    const pend = await c.get("SELECT COUNT(*) c FROM contracts WHERE status IN ('pending_approval','legal_review')");
    const risks = await c.get("SELECT COUNT(*) c FROM risks WHERE status='open'");
    return { contracts_pending: Number(pend?.c || 0), risks_open: Number(risks?.c || 0) };
  });

  out.qa = await safe(async () => {
    const total = await c.get('SELECT COUNT(*) c FROM qa_checks');
    const fail = await c.get("SELECT COUNT(*) c FROM qa_checks WHERE result='fail'");
    const repeat = await c.get('SELECT COUNT(*) c FROM qa_checks WHERE repeat_of IS NOT NULL');
    const t = Number(total?.c || 0);
    return { total: t, fail: Number(fail?.c || 0), defect_rate: t ? Math.round(Number(fail?.c || 0) / t * 1000) / 10 : 0, repeat: Number(repeat?.c || 0) };
  });

  out.product = await safe(async () => {
    const rows = await c.query('SELECT stage, COUNT(*) c FROM product_features GROUP BY stage');
    const byStage = {};
    for (const r of rows) byStage[r.stage] = Number(r.c);
    return { by_stage: byStage, total: rows.reduce((s, r) => s + Number(r.c), 0) };
  });

  const suggestions = [];
  try {
    if (Number(out.finance?.ar || 0) > 0) suggestions.push({ title: 'Thu hoi AR qua han', why: `AR con ${Number(out.finance.ar).toLocaleString('vi-VN')}d`, raci: { R: 'accountant', A: 'cfo' }, api: 'POST /api/debts/remind-all', deadline: 'hom nay 17h' });
  } catch {}
  try {
    if (Number(out.ops?.stock_low || 0) > 0) suggestions.push({ title: 'Nhap bu ton kho do', why: `${out.ops.stock_low} SKU duoi nguong`, raci: { R: 'warehouse', A: 'coo' }, api: 'POST /api/stock/in', deadline: 'trong 48h' });
  } catch {}
  try {
    if (Number(out.cskh?.sla_breach || 0) > 0) suggestions.push({ title: 'Xu ly ticket tre SLA', why: `${out.cskh.sla_breach} ticket breach`, raci: { R: 'cskh', A: 'manager' }, api: 'GET /api/cskh/sla', deadline: 'trong 4h' });
  } catch {}
  try {
    if (Number(out.ceo?.approvals_pending || 0) > 0) suggestions.push({ title: 'Duyet chung tu ton', why: `${out.ceo.approvals_pending} approval pending`, raci: { R: 'manager', A: 'ceo' }, api: 'POST /api/approvals/:id/decide', deadline: 'hom nay' });
  } catch {}
  try {
    if (Number(out.marketing?.leads || 0) > 0) suggestions.push({ title: 'Cham lead moi', why: `${out.marketing.leads} leads can cham`, raci: { R: 'sales', A: 'manager' }, api: 'POST /api/leads/:id/convert', deadline: 'trong 24h' });
  } catch {}
  while (suggestions.length < 5) {
    suggestions.push({ title: 'Kiem ke dinh ky', why: 'Duy tri van hanh on dinh', raci: { R: 'staff', A: 'manager' }, api: 'GET /api/departments/overview', deadline: 'cuoi tuan' });
  }
  out.agent_suggestion = suggestions.slice(0, 5);
  out.generated_at = new Date().toISOString();
  return out;
}

function dailyBrief(ov) {
  const L = [];
  L.push(`# Daily Brief — ${String(ov.generated_at || '').slice(0, 10)}`);
  L.push(``);
  L.push(`- Doanh thu 30d: ${Number(ov.sales?.revenue30d || 0).toLocaleString('vi-VN')}d | Don: ${ov.sales?.orders30d ?? 0} | Win-rate: ${ov.sales?.win_rate ?? 0}% | Retention: ${ov.sales?.retention ?? 0}%`);
  L.push(`- AR: ${Number(ov.finance?.ar || 0).toLocaleString('vi-VN')}d | DSO: ${ov.finance?.dso ?? 0} ngay | Ton kho do: ${ov.ops?.stock_low ?? 0} | Ticket tre SLA: ${ov.cskh?.sla_breach ?? 0}`);
  L.push(`- Nhan su: ${ov.hr?.headcount ?? 0} (present hom nay ${ov.hr?.present_today ?? 0}, turnover 30d ${ov.hr?.turnover_30d ?? 0}%) | QA fail: ${ov.qa?.fail ?? 0} | IT mo: ${ov.it?.open ?? 0}`);
  L.push(``);
  L.push(`## 5 viec hom nay`);
  (ov.agent_suggestion || []).slice(0, 5).forEach((s, i) => {
    L.push(`${i + 1}. ${s.title} — ${s.why} (R:${s.raci?.R}/A:${s.raci?.A}, ${s.api}, han: ${s.deadline})`);
  });
  L.push(``);
  L.push(`_Doc 2 phut. Chi tiet: GET /api/departments/overview_`);
  return L.join('\n');
}

module.exports = { getOverview, dailyBrief };
