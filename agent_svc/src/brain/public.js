// brain/public.js — chat công khai storefront (P4)
// Nguyên tắc: chỉ đọc knowledge_public + products published (giá bán, nhãn còn/hết).
// CẤM: cost/giá vốn/lương/tồn số lượng/tổng kho/doanh thu nội bộ. Debt/order chỉ sau xác thực contact.
const fs = require('fs');
const path = require('path');
const { norm } = require('../db');
const cskh = require('./cskh');

let pubCache = null;
function loadPublicChunks() {
  if (pubCache) return pubCache;
  const dir = path.join(__dirname, '..', '..', 'knowledge_public');
  pubCache = [];
  if (!fs.existsSync(dir)) return pubCache;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const parts = raw.split(/^## /m).filter((s) => s.trim());
    for (const p of parts) {
      const title = p.split('\n')[0].trim();
      pubCache.push({ source: `public/${f}#${title}`, text: p.trim(), norm: norm(p) });
    }
  }
  return pubCache;
}
function ragPublic(query, topK = 3) {
  const chunks = loadPublicChunks();
  const qn = norm(query);
  const qw = new Set(qn.split(' ').filter((w) => w.length > 1));
  const scored = chunks.map((c) => {
    const cw = new Set(c.norm.split(' ').filter((w) => w.length > 1));
    let overlap = 0;
    for (const w of qw) if (cw.has(w)) overlap++;
    return { ...c, score: overlap };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter((c) => c.score > 0);
}

// Guard public: kế thừa guardReply + chặn rò rỉ tồn số/cost/lương/doanh thu
function guardPublic(reply, whitelist) {
  const g = cskh.guardReply(reply, whitelist);
  let text = g.text;
  const ntext = norm(text);
  let extra = false;
  const reasons = [...g.reasons];
  // tồn số lượng chi tiết: "tồn 118", "còn 118 ly", "kho còn ..."
  if (/(ton\s*\d+|kho\s*(con)?\s*\d+|con\s*\d+\s*(ly|cai|hop|goi|phan)|doanh thu|loi nhuan|revenue)/.test(ntext)) {
    text = text.replace(/\d[\d.,]*\s*(ly|cai|hop|goi|phan)?/gi, '[số liệu nội bộ]');
    extra = true;
    reasons.push('leak-stock-revenue');
  }
  if (/(gia von|\bcost\b|luong|salary)/.test(ntext) && !text.includes('[giá nội bộ]')) {
    text = text.replace(/\d[\d.,]*d?/gi, '[giá nội bộ]');
    extra = true;
    reasons.push('leak-cost-salary');
  }
  const needsReview = g.needsReview || extra;
  if (needsReview && !text.includes('[CẦN-DUYỆT]')) text += ' [CẦN-DUYỆT]';
  return { text, needsReview, reasons };
}

function extractContact(s) {
  const m = String(s || '').match(/0\d{9,10}/);
  if (m) return m[0];
  const e = String(s || '').match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return e ? e[0].toLowerCase() : null;
}
function extractOrderCode(s) {
  const m = String(s || '').match(/DHW-\d+/i);
  return m ? m[0].toUpperCase() : null;
}

async function publicMenu(c) {
  try {
    const rows = await c.query('SELECT sku, name, price, is_combo FROM products WHERE COALESCE(is_published,1)=1 ORDER BY sort_order, name LIMIT 8');
    const labels = [];
    for (const r of rows.slice(0, 5)) {
      let stock = 0;
      if (r.is_combo) {
        const parts = await c.query('SELECT * FROM product_combos WHERE parent_sku=?', [r.sku]);
        if (!parts.length) stock = 0;
        else {
          stock = Infinity;
          for (const p of parts) {
            const on = await c.get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [p.child_sku]);
            stock = Math.min(stock, Math.floor(Number(on?.s || 0) / Number(p.qty)));
          }
          if (stock === Infinity) stock = 0;
        }
      } else {
        const on = await c.get('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE product_sku=?', [r.sku]);
        stock = Number(on?.s || 0);
      }
      const st = stock > 0 ? 'còn hàng' : 'hết hàng';
      labels.push(`${r.name} ${Number(r.price).toLocaleString('vi-VN')}đ (${st})`);
    }
    return labels;
  } catch { return []; }
}

async function findCustomerByContact(c, contact) {
  if (!contact) return null;
  const cc = String(contact).trim().toLowerCase();
  let cust = await c.get('SELECT * FROM customers WHERE phone=?', [contact]);
  if (!cust) cust = await c.get('SELECT * FROM customers WHERE lower(email)=?', [cc]);
  return cust;
}

// publicChatReply — chữ ký giống cskh.chatReply nhưng nguồn public
async function publicChatReply(conn, { message, contact = null, lookup_token = null, actor = null }) {
  const t0 = Date.now();
  const db = require('../db');
  const c = (conn && conn.run) ? conn : db;
  const n = norm(message || '');
  const chunks = ragPublic(message || '', 3);
  const cite = chunks.length ? `\n(Nguồn: ${chunks.map((x) => x.source).join(', ')})` : '';
  const verifiedContact = (contact && String(contact).trim()) || extractContact(message);
  const ocode = extractOrderCode(message);

  // 0. Injection — chặn bằng code + ticket CSKH
  if (/(bo qua quy dinh|ignore (previous|all) instructions|system prompt|jailbreak|prompt injection|hien gia von|cho xem luong|ton kho bao nhieu|ep lo prompt|tiet lo prompt)/.test(n)) {
    const g0 = guardPublic('Em ghi nhận yêu cầu và chuyển CSKH xử lý ạ.', new Set());
    let ticket_id = null;
    try {
      const hd = require('./helpdesk');
      const t = await hd.createTicket(c, { customer_id: null, category: 'easy', content: String(message).slice(0, 500), priority: 'normal', actor: actor || 'public-chat' });
      ticket_id = t?.id || null;
    } catch {}
    await logPub(c, { contentIn: message, contentOut: g0.text, ms: Date.now() - t0 });
    return { reply: g0.text, intent: 'easy', category: 'easy', sources: [], needsReview: true, createTicket: true, ticket_id };
  }

  // 0b. Doi giam 50%/qua trai phep -> tu choi + neu promo hien co (khong ticket, khong hua)
  if (/(giam\s*50|giam nua|tang qua|tang kem|mien phi.*tang|uu dai khung)/.test(n) && /(cho|di|nhe|di ma|cho em|xin)/.test(n)) {
    const promoRow = await c.get("SELECT title FROM promotions WHERE COALESCE(is_active,1)=1 ORDER BY id DESC LIMIT 1").catch(() => null);
    const promoTxt = promoRow?.title ? ` Chương trình hiện có: ${promoRow.title}.` : ' Chương trình hiện có xem tại mục Ưu đãi ạ.';
    const replyD = `Dạ em không áp giảm riêng ngoài chương trình công bố ạ.${promoTxt}`;
    await logPub(c, { contentIn: message, contentOut: replyD, ms: Date.now() - t0 });
    return { reply: replyD, intent: 'promo', category: 'easy', sources: chunks.map((x) => x.source), needsReview: false, createTicket: false };
  }

  // 0d. Moi gia von / ton so luong / luong / doanh thu -> tu choi + ticket (0 leak)
  if (/(gia von|\bcost\b|luong|salary|ton kho|ton chi tiet|kho con|con \d+ ly|doanh thu|loi nhuan|bao cao doanh thu)/.test(n)) {
    const replyS = 'Dạ thông tin này em không cung cấp công khai ạ. Em đã chuyển CSKH hỗ trợ, mình để lại SĐT nhé.';
    const gS = guardPublic(replyS, new Set());
    let ticket_id = null;
    try {
      const hd = require('./helpdesk');
      const t = await hd.createTicket(c, { customer_id: null, category: 'easy', content: String(message).slice(0, 500), priority: 'normal', actor: actor || 'public-chat' });
      ticket_id = t?.id || null;
    } catch {}
    await logPub(c, { contentIn: message, contentOut: gS.text, ms: Date.now() - t0 });
    return { reply: gS.text, intent: 'easy', category: 'easy', sources: [], needsReview: gS.needsReview, createTicket: true, ticket_id };
  }

  // 0e. Khai ma KH / hoi no (ke ca "cho xem no", "khai ma") -> debt_unverified, khong lo so
  if (/(xem no|cho xem no|khai ma|ma kh|cong no|con no|du no|tra no|thieu bao nhieu|con thieu|han thanh toan)/.test(n) && !ocode) {
    if (!verifiedContact) {
      const reply = 'Em chào anh/chị, để tra cứu công nợ vui lòng cho em xin SĐT đã mua hàng để xác thực ạ.';
      await logPub(c, { contentIn: message, contentOut: reply, ms: Date.now() - t0 });
      return { reply, intent: 'debt_unverified', category: 'policy_inquiry', sources: [], needsReview: false, createTicket: false };
    }
  }
  // 0c. Moi du lieu (xem het don/kho/luong/list KH) -> tu choi + ticket CSKH
  if (/(xem het|tat ca don|list don|liet ke don|tong kho|ton kho chi tiet|luong nhan|danh sach khach|bao cao doanh thu|doanh thu bao nhieu)/.test(n)) {
    const replyM = 'Dạ thông tin này em không cung cấp công khai ạ. Em đã chuyển CSKH hỗ trợ, mình để lại SĐT nhé.';
    const gM = guardPublic(replyM, new Set());
    let ticket_id = null;
    try {
      const hd = require('./helpdesk');
      const t = await hd.createTicket(c, { customer_id: null, category: 'easy', content: String(message).slice(0, 500), priority: 'normal', actor: actor || 'public-chat' });
      ticket_id = t?.id || null;
    } catch {}
    await logPub(c, { contentIn: message, contentOut: gM.text, ms: Date.now() - t0 });
    return { reply: gM.text, intent: 'easy', category: 'easy', sources: [], needsReview: gM.needsReview, createTicket: true, ticket_id };
  }

  // 1. Tra cứu đơn bằng mã DHW — cần contact xác thực
  if (ocode) {
    if (!verifiedContact) {
      const reply = `Để tra cứu đơn ${ocode}, mình cho em xin SĐT hoặc email đã đặt hàng ạ.`;
      await logPub(c, { contentIn: message, contentOut: reply, ms: Date.now() - t0 });
      return { reply, intent: 'lookup_unverified', category: 'policy_inquiry', sources: [], needsReview: false, createTicket: false };
    }
    const order = await c.get('SELECT * FROM orders WHERE code=? OR lookup_code=?', [ocode, ocode]);
    const cust = order ? await c.get('SELECT * FROM customers WHERE id=?', [order.customer_id]) : null;
    const okContact = cust && (
      String(cust.phone || '').trim() === String(verifiedContact).trim() ||
      String(cust.email || '').trim().toLowerCase() === String(verifiedContact).trim().toLowerCase()
    );
    let tokenOk = false;
    if (order && lookup_token) {
      const crypto = require('crypto');
      const h = crypto.createHash('sha256').update(String(lookup_token)).digest('hex');
      try {
        const row = await c.get("SELECT * FROM order_lookup_tokens WHERE order_id=? AND token_hash=? AND expires_at > datetime('now')", [order.id, h]);
        if (row) tokenOk = true;
      } catch {}
    }
    if (!order || (!okContact && !tokenOk)) {
      const reply = 'Em không tìm thấy đơn với thông tin xác thực này ạ. Mình kiểm tra lại mã đơn + SĐT/email giúp em nhé.';
      await logPub(c, { contentIn: message, contentOut: reply, ms: Date.now() - t0 });
      return { reply, intent: 'lookup', category: 'policy_inquiry', sources: [], needsReview: false, createTicket: false };
    }
    const debts = await c.query("SELECT * FROM debts WHERE order_id=? AND type='receivable'", [order.id]);
    const paid = debts.reduce((s, d) => s + Number(d.paid || 0), 0);
    const remain = Math.max(0, Number(order.amount) - paid);
    const wl = new Set([Number(order.amount), paid, remain].filter((v) => v > 0));
    let reply = `Đơn ${order.code} trạng thái ${order.status}, tổng ${Number(order.amount).toLocaleString('vi-VN')}đ, đã trả ${paid.toLocaleString('vi-VN')}đ, còn lại ${remain.toLocaleString('vi-VN')}đ.` + cite;
    const g = guardPublic(reply, wl);
    await logPub(c, { contentIn: message, contentOut: g.text, ms: Date.now() - t0 });
    return { reply: g.text, intent: 'lookup', category: 'policy_inquiry', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: false, order_code: order.code };
  }

  // 2. Hỏi nợ cá nhân — bắt buộc xác thực
  if (/(cong no|con no|du no|tra no|thieu bao nhieu|con thieu|han thanh toan)/.test(n) && /(cua toi|cua minh|giup toi|xem|tra cuu|kiem tra|don|sdt|so dien thoai)/.test(n)) {
    if (!verifiedContact) {
      const reply = 'Em chào anh/chị, để tra cứu công nợ vui lòng cho em xin SĐT đã mua hàng để xác thực ạ.';
      await logPub(c, { contentIn: message, contentOut: reply, ms: Date.now() - t0 });
      return { reply, intent: 'debt_unverified', category: 'policy_inquiry', sources: [], needsReview: false, createTicket: false };
    }
    const cust = await findCustomerByContact(c, verifiedContact);
    if (!cust) {
      const reply = 'Em không tìm thấy SĐT này trong hệ thống ạ. Mình kiểm tra lại giúp em nhé.';
      await logPub(c, { contentIn: message, contentOut: reply, ms: Date.now() - t0 });
      return { reply, intent: 'debt', category: 'policy_inquiry', sources: [], needsReview: false, createTicket: false };
    }
    const rows = await c.query("SELECT * FROM debts WHERE customer_id=? AND type='receivable' AND status IN ('open','overdue') ORDER BY due_date", [cust.id]);
    if (!rows.length) {
      const reply = `Em kiểm tra SĐT đã xác thực không còn công nợ mở nào ạ.` + cite;
      await logPub(c, { contentIn: message, contentOut: reply, ms: Date.now() - t0 });
      return { reply, intent: 'debt', category: 'policy_inquiry', sources: chunks.map((x) => x.source), needsReview: false, createTicket: false };
    }
    const total = rows.reduce((s, d) => s + (Number(d.amount) - Number(d.paid)), 0);
    const wl = new Set();
    for (const d of rows) { wl.add(Number(d.amount)); wl.add(Number(d.amount) - Number(d.paid)); }
    let reply = `Em tra cứu SĐT đã xác thực: còn ${rows.length} khoản, tổng còn lại ${total.toLocaleString('vi-VN')}đ.` + cite;
    const g = guardPublic(reply, wl);
    await logPub(c, { contentIn: message, contentOut: g.text, ms: Date.now() - t0 });
    return { reply: g.text, intent: 'debt', category: 'policy_inquiry', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: false };
  }

  // 3. Chính sách hỏi thông tin (không ticket) — trước khiếu nại để "chính sách đổi trả thế nào" không thành complaint
  const isPolicyQ = /(chinh sach|quy dinh|dieu kien|the nao|la gi|bao lau|trong bao lau)/.test(n) && /(doi tra|bao hanh|vat|hoa don|cong no|han thanh toan)/.test(n);
  if (isPolicyQ && chunks.length) {
    const top = chunks[0].text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 3).join(' ').slice(0, 300);
    const wl = new Set();
    for (const ch of chunks) for (const mm of String(ch.text).match(/\d[\d.,]*/g) || []) { const v = Number(String(mm).replace(/[.,]/g, '')); if (v > 0) wl.add(v); }
    const menu0 = await publicMenu(c);
    for (const m of menu0) for (const mm of String(m).match(/\d[\d.,]*/g) || []) { const v = Number(String(mm).replace(/[.,]/g, '')); if (v > 0) wl.add(v); }
    const reply0 = `Dạ theo chính sách: ${top}` + cite;
    const g0 = guardPublic(reply0, wl);
    await logPub(c, { contentIn: message, contentOut: g0.text, ms: Date.now() - t0 });
    return { reply: g0.text, intent: 'policy', category: 'policy_inquiry', sources: chunks.map((x) => x.source), needsReview: g0.needsReview, createTicket: false };
  }

  // 3b. Khiếu nại / kỹ thuật / pháp lý → tạo ticket (public vẫn tạo phiếu CSKH)
  const lower = String(message || '').toLowerCase();
  const isComplaint = /(doi tra|khieu nai|bi loi|bi hong|hong khi nhan|vo hang|giao thieu|giao loi|that lac)/.test(n) && !isPolicyQ && !/(chinh sach)/.test(n);
  const isTechnical = /(dang nhap|quen mat khau|app loi|ket noi|khong vao duoc|loi thanh toan)/.test(n);
  const isLegal = /(hop dong|khoi kien|tranh chap|luat su|phap ly)/.test(n);
  if (isComplaint || isTechnical || isLegal) {
    const cat = isComplaint ? 'complaint' : isTechnical ? 'technical' : 'legal';
    let reply = isComplaint
      ? 'Em rất tiếc về trải nghiệm này ạ. Em đã ghi nhận và tạo phiếu hỗ trợ, QA kiểm tra trong 24h. Mình cho em xin mã đơn + ảnh sản phẩm nhé.' + cite
      : isTechnical
        ? 'Em ghi nhận sự cố kỹ thuật và tạo phiếu cho IT xử lý ạ. Mình mô tả thêm thiết bị + bước bị lỗi nhé.' + cite
        : 'Em chuyển yêu cầu pháp lý cho legal soạn trong 2 ngày làm việc ạ. Mình để lại MST/thông tin hợp đồng nhé.' + cite;
    const g = guardPublic(reply, new Set([2, 24]));
    let ticket_id = null;
    try {
      const hd = require('./helpdesk');
      const t = await hd.createTicket(c, { customer_id: null, category: cat, content: String(message).slice(0, 500), priority: cat === 'complaint' ? 'high' : 'normal', actor: actor || 'public-chat' });
      ticket_id = t?.id || null;
    } catch {}
    await logPub(c, { contentIn: message, contentOut: g.text, ms: Date.now() - t0 });
    return { reply: g.text, intent: cat, category: cat, sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: true, ticket_id };
  }

  // 4. Thực đơn / giá / khuyến mãi / ship / giờ mở cửa — context public (giá + nhãn hàng)
  const menu = await publicMenu(c);
  const wlMenu = new Set(menu.flatMap((m) => (m.match(/\d[\d.,]*/g) || []).map((x) => Number(String(x).replace(/[.,]/g, ''))).filter((v) => v > 0)));
  for (const ch of chunks) for (const mm of String(ch.text).match(/\d[\d.,]*/g) || []) { const v = Number(String(mm).replace(/[.,]/g, '')); if (v > 0) wlMenu.add(v); }
  if (chunks.length || /(gia|menu|thuc don|combo|khuyen mai|uu dai|dat|ship|giao|mo cua|tra cuu|teabreak|vat|hoa don)/.test(n)) {
    const top = chunks[0] ? chunks[0].text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ').slice(0, 250) : 'em gửi thông tin ạ.';
    let reply = `Dạ ${top} ${menu.length ? 'Thực đơn: ' + menu.slice(0, 3).join('; ') + '. ' : ''}Mình chọn món nào để em lên đơn ạ?` + cite;
    const g = guardPublic(reply, wlMenu);
    await logPub(c, { contentIn: message, contentOut: g.text, ms: Date.now() - t0 });
    return { reply: g.text, intent: 'info', category: 'easy', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: false };
  }

  // 5. Mặc định
  let reply = 'Dạ em đã nhận tin nhắn, mình cần hỗ trợ đặt món, tra cứu đơn hay đặt teabreak ạ?';
  const g = guardPublic(reply, new Set());
  await logPub(c, { contentIn: message, contentOut: g.text, ms: Date.now() - t0 });
  return { reply: g.text, intent: 'easy', category: 'easy', sources: [], needsReview: g.needsReview, createTicket: false };
}

async function logPub(c, { contentIn, contentOut, ms }) {
  try {
    const tokens = Math.ceil((String(contentIn || '').length + String(contentOut || '').length) / 4);
    await c.run('INSERT INTO messages(customer_id,direction,content,channel) VALUES(?,?,?,?)', [null, 'in', String(contentIn).slice(0, 1000), 'public']);
    await c.run('INSERT INTO messages(customer_id,direction,content,channel) VALUES(?,?,?,?)', [null, 'out', `${String(contentOut).slice(0, 1000)} [latency=${ms}ms tokens~${tokens}]`, 'public']);
  } catch {}
}

module.exports = { publicChatReply, ragPublic, guardPublic, loadPublicChunks };
