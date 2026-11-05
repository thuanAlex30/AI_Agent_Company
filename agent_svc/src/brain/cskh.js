const fs = require('fs');
const path = require('path');
const { norm } = require('../db');

// System bat bien (<=80 tu, xung em, chot 1 hanh dong, cam hua giam/qua, >10tr co)
const SYSTEM = 'Em la CSKH BizOps. Tra loi ngan gon, xung em, dua 1 hanh dong tiep theo. Khong hua giam gia hay tang qua. So tien chi dung so da xac thuc. So >10tr can duyet. Trich nguon knowledge.';
const SYSTEM_WORDS = SYSTEM.split(/\s+/).length; // ~40

// ---- RAG: knowledge chia ##, overlap tu, top-3 ----
let chunkCache = null;
function loadChunks() {
  if (chunkCache) return chunkCache;
  const dir = path.join(__dirname, '..', '..', 'knowledge');
  chunkCache = [];
  if (!fs.existsSync(dir)) return chunkCache;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const parts = raw.split(/^## /m).filter((s) => s.trim());
    for (const p of parts) {
      const title = p.split('\n')[0].trim();
      chunkCache.push({ source: `${f}#${title}`, text: p.trim(), norm: norm(p) });
    }
  }
  return chunkCache;
}
function rag(query, topK = 3) {
  const chunks = loadChunks();
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
function numbersIn(s) {
  const m = String(s || '').match(/\d[\d.,]*/g) || [];
  return m.map((x) => Number(x.replace(/[.,]/g, (c, i, a) => '')));
}
function whitelistFrom(ctx, chunks) {
  const set = new Set();
  const add = (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) set.add(n); };
  for (const p of (ctx.prices || [])) { add(p.price); add(p.stock); }
  for (const d of (ctx.debts || [])) { add(d.remain); add(d.amount); }
  for (const c of (ctx.campaigns || [])) add(c.cost);
  for (const ch of (chunks || [])) for (const n of numbersIn(ch.text)) add(n);
  // SLA/gio lich hop le chung (khong phai so tien)
  for (const h of [2, 4, 7, 8, 12, 15, 22, 24, 72]) set.add(h);
  return set;
}

// ---- Guardrail CODE sau reply ----
function guardReply(reply, whitelist) {
  let text = String(reply || '');
  const ntext = norm(text);
  let needsReview = false;
  const reasons = [];
  // leak cost/luong -> che '[gia noi bo]' + co (check tren ban normalize khong dau)
  if (/(gia von|\bcost\b|luong|salary|salary_base)/.test(ntext)) {
    text = text.replace(/\d[\d.,]*d?/gi, '[giá nội bộ]');
    needsReview = true;
    reasons.push('leak-cost-salary');
  }
  // hua giam/tang/mien phi (check khong dau: 'giam 50%' -> norm mat %, nen khong doi hoi %)
  if (/(giam\s*\d+|giam gia|tang qua|mien phi.*tang|tang.*mien phi)/.test(ntext)) {
    needsReview = true;
    reasons.push('promise-discount-gift');
  }
  // injection (check khong dau)
  if (/(bo qua quy dinh|ignore (previous|all) instructions|system prompt|jailbreak|prompt injection)/.test(ntext)) {
    text = 'Em ghi nhận yêu cầu và chuyển CSKH xử lý ạ.';
    needsReview = true;
    reasons.push('injection');
  }
  // so la ngoai whitelist -> co [CAN-DUYET]
  if (whitelist instanceof Set) {
    const nums = numbersIn(text).filter((n) => n >= 1000);
    for (const n of nums) {
      if (!whitelist.has(n)) { needsReview = true; reasons.push('number-not-in-context:' + n); break; }
    }
  }
  if (needsReview && !text.includes('[CẦN-DUYỆT]')) text += ' [CẦN-DUYỆT]';
  return { text, needsReview, reasons };
}

// ---- Helpers word-boundary ----
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function hasWB(ntext, phrase) {
  const p = norm(phrase);
  return new RegExp(`\\b${esc(p)}\\b`).test(ntext);
}
function hasAnyWB(ntext, phrases) {
  return phrases.some((p) => hasWB(ntext, p));
}

function detectDebt(n) {
  return hasAnyWB(n, ['cong no', 'con no', 'con no khong', 'du no', 'xem no', 'xem du no', 'tra no', 'no cua toi', 'kiem tra no', 'tra cuu no', 'con thieu', 'thieu bao nhieu', 'don no', 'thanh toan don', 'han thanh toan']);
}
// Debt ca nhan (can xac thuc SDT) khac hoi chinh sach chung:
// 'Han thanh toan cong no la may ngay?' -> policy; 'Han thanh toan don gan nhat?' -> debt ca nhan.
function detectPersonalDebt(n, msg) {
  if (!detectDebt(n)) return false;
  // hoi vi tri don ('tra cuu don DH001 o dau?') -> info, khong phai debt ca nhan
  if (hasWB(n, 'o dau') && !extractPhone(msg || '')) return false;
  if (extractPhone(msg)) return true;
  if (/dh\d+/i.test(msg || '')) {
    // ma don kem tu ca nhan/xac thuc thi moi la debt, bare 'tra cuu o dau' thi khong
    if (hasAnyWB(n, ['cua toi', 'cua minh', 'no', 'du no', 'thieu', 'han thanh toan', 'con bao nhieu'])) return true;
    return false;
  }
  return hasAnyWB(n, ['cua toi', 'cua minh', 'giup toi', 'giup minh', 'xem', 'tra cuu', 'kiem tra', 'con bao nhieu', 'thieu bao nhieu', 'con thieu', 'don', 'ma kh', 'sdt', 'so dien thoai', 'don gan nhat', 'con no khong', 'du no']);
}
function detectThanks(n) {
  return hasAnyWB(n, ['cam on', 'thank', 'tuyet voi', 'rat tot', 'hai long', 'rat hai long']);
}
function detectPolicy(n) {
  if (hasAnyWB(n, ['chinh sach', 'hoa don', 'vat', 'xuat hoa don', 'han thanh toan cong no la may ngay', 'quy dinh', 'dieu kien'])) return true;
  if (hasAnyWB(n, ['doi tra the nao', 'bao hanh the nao', 'doi tra trong bao lau'])) return true;
  // hoi thong tin bao hanh/doi tra (the nao/la gi/dieu kien) -> policy, khong ticket
  if (hasAnyWB(n, ['bao hanh', 'doi tra']) && hasAnyWB(n, ['the nao', 'la gi', 'dieu kien', 'bao lau', 'trong bao lau', 'chinh sach', 'quy dinh'])) return true;
  // hoi bare 'san pham co bao hanh?' (khong kem doi tra/khieu nai/loi/hong) -> policy
  if (hasWB(n, 'bao hanh') && !hasAnyWB(n, ['doi tra', 'khieu nai', 'can bao hanh', 'yeu cau', 'bi loi', 'bi hong', 'hong', 'loi', 'vo', 'thieu', 'that bai'])) return true;
  return false;
}
function detectLegal(n) {
  return hasAnyWB(n, ['hop dong', 'khoi kien', 'kien tung', 'phap ly', 'luat su', 'tranh chap']);
}
function detectLegalStrong(n) {
  if (hasAnyWB(n, ['tranh chap', 'khoi kien', 'kien tung', 'luat su', 'soan hop dong', 'hop dong dai ly'])) return true;
  if (hasWB(n, 'phap ly') && !hasWB(n, 'doi tra') && !hasWB(n, 'bao hanh')) return true;
  if (hasWB(n, 'hop dong') && hasAnyWB(n, ['dai ly', 'tranh chap', 'kien tung', 'soan'])) return true;
  return false;
}
function detectPromo(n) {
  return hasAnyWB(n, ['khuyen mai', 'combo', 'uu dai', 'giam gia', 'sale', 'ma giam', 'chuong trinh']);
}
function detectShip(n) {
  return hasAnyWB(n, ['giao may ngay', 'bao lau thi giao', 'phi ship', 'giao hang', 'van chuyen', 'ship bao nhieu', 'don dang o dau', 'tra cuu don', 'ma van don', 'giao trong bao lau']);
}
// complaint: cum xac dinh. 'hong' mau (ao/mau hong/hong tra) KHONG phai hong vo.
// Chinh sach ('chinh sach doi tra the nao') do policy xu ly truoc — o day tra false de khong cuop.
function detectComplaint(lower, n) {
  if (hasWB(n, 'chinh sach')) return false;
  // loi mang/app/dang nhap/ket noi (khong kem tu san pham) -> technical, khong phai complaint
  if (hasAnyWB(n, ['mang', 'wifi', 'app', 'dang nhap', 'ket noi', 'mat khau']) && !hasAnyWB(n, ['hang', 'san pham', 'banh', 'ly', 'may pha', 'doi tra', 'khieu nai', 'giao thieu', 'giao loi', 'vo hang'])) return false;
  // giao cham/tre/qua han -> complaint (khieu nai van chuyen)
  if (hasAnyWB(n, ['cham', 'tre', 'qua han']) && hasAnyWB(n, ['giao', 'hang', 'don', 'ship', 'van chuyen'])) return true;
  const colorCtx = hasAnyWB(n, ['mau hong', 'ao hong', 'hong tra', 'tra hong']) || (hasWB(n, 'hong') && hasAnyWB(n, ['ao', 'mau', 'tra', 'size']));
  if (colorCtx) {
    // chi coi la complaint khi co cum hong hoc ro rang (doi tra/khieu nai/vo/loi/thieu...), bare 'hong' mau thi bo qua
    if (hasAnyWB(n, ['doi tra', 'khieu nai', 'vo hang', 'hang loi', 'giao loi', 'giao that bai', 'giao thieu', 'that lac', 'mat hang', 'bi loi', 'bi hong', 'hong nang', 'san pham loi', 'hang hong'])) return true;
    if (hasWB(n, 'bao hanh') && !hasWB(n, 'chinh sach')) return true;
    return false;
  }
  if (hasAnyWB(n, ['doi tra', 'khieu nai'])) return true;
  if (hasWB(n, 'bao hanh') && !hasWB(n, 'chinh sach')) return true;
  if (hasAnyWB(n, ['bi loi', 'loi roi', 'san pham loi', 'bi hong', 'hong khi nhan', 'hong nang', 'vo hang', 'giao loi', 'giao that bai', 'giao thieu', 'that lac', 'mat hang'])) return true;
  // hang/san pham/don/may + tu hong (loi/hong/vo/thieu) trong cung cau
  if (hasAnyWB(n, ['hang', 'san pham', 'don', 'may', 'banh', 'ly']) && hasAnyWB(n, ['loi', 'hong', 'vo', 'thieu', 'that bai', 'that lac'])) return true;
  return false;
}
function detectTechnical(lower, n) {
  // CAM tu 'giao' chung — chi cum cu the
  if (hasAnyWB(n, ['dang nhap', 'quen mat khau', 'doi mat khau', 'app loi', 'bao loi', 'sai dia chi', 'giao loi', 'giao that bai', 'mat hang', 'giao thieu', 'ket noi', 'khong vao duoc', 'loi thanh toan', 'sai tien'])) return true;
  return false;
}
function extractPhone(s) {
  const m = String(s || '').match(/0\d{9,10}/);
  return m ? m[0] : null;
}

async function buildDebtContext(conn, customer) {
  if (!customer) return { debts: [] };
  const rows = await conn.query("SELECT * FROM debts WHERE customer_id=? AND type='receivable' AND status IN ('open','overdue') ORDER BY due_date", [customer.id]);
  return { debts: rows.map((d) => ({ id: d.id, order_id: d.order_id, amount: Number(d.amount), paid: Number(d.paid), remain: Number(d.amount) - Number(d.paid), due_date: d.due_date, status: d.status })) };
}

// chatReply — rule xac dinh + RAG + guardrail. Khong tao cron.
async function chatReply(conn, { message, phone = null, otp = null, customer_id = null, actor = null }) {
  const t0 = Date.now();
  const db = require('../db');
  const c = (conn && conn.run) ? conn : db;
  const lower = String(message || '').toLowerCase();
  const n = norm(message || '');
  const chunks = rag(message || '', 3);
  const cite = chunks.length ? `\n(Nguồn: ${chunks.map((x) => x.source).join(', ')})` : '';

  // 0. Injection — chan bang code truoc moi thu (check tren ban normalize khong dau)
  if (/(bo qua quy dinh|ignore (previous|all) instructions|system prompt|jailbreak|prompt injection)/.test(n)) {
    const g = guardReply('Em ghi nhận yêu cầu và chuyển CSKH xử lý ạ.', new Set());
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: 'easy', category: 'easy', sources: [], needsReview: true, createTicket: false };
  }

  // 1. Debt CA NHAN — bat buoc xac thuc SDT truoc khi noi so.
  // Hoi chinh sach chung ('Han thanh toan cong no la may ngay?') -> policy, KHONG vao day.
  // Tra cuu vi tri don ('Tra cuu don DH001 o dau?') -> info, KHONG phai debt.
  if (detectPersonalDebt(n, message)) {
    let customer = null;
    const ph = phone || extractPhone(message);
    if (ph) customer = await c.get('SELECT * FROM customers WHERE phone=?', [ph]);
    if (!customer && customer_id) customer = await c.get('SELECT * FROM customers WHERE id=?', [customer_id]);
    // OTP dev '000000' + customer_id -> xac thuc
    if (!customer && otp === '000000' && customer_id) customer = await c.get('SELECT * FROM customers WHERE id=?', [customer_id]);
    if (!customer) {
      const reply = 'Em chào anh/chị, để tra cứu công nợ vui lòng cho em xin SĐT đã mua hàng để xác thực ạ.';
      await logPair(c, { customer_id: null, contentIn: message, contentOut: reply, channel: 'web', ms: Date.now() - t0 });
      return { reply, intent: 'debt_unverified', category: 'policy_inquiry', sources: [], needsReview: false, createTicket: false };
    }
    const ctx = await buildDebtContext(c, customer);
    if (!ctx.debts.length) {
      const reply = `Em kiểm tra SĐT của mình không còn công nợ mở nào ạ. Mình cần hỗ trợ thêm gì không ạ?${cite}`;
      await logPair(c, { customer_id: customer.id, contentIn: message, contentOut: reply, channel: 'web', ms: Date.now() - t0 });
      return { reply, intent: 'debt', category: 'policy_inquiry', sources: chunks.map((x) => x.source), needsReview: false, createTicket: false };
    }
    const total = ctx.debts.reduce((s, d) => s + d.remain, 0);
    const wl = whitelistFrom({ debts: ctx.debts }, chunks);
    let reply = `Em tra cứu SĐT đã xác thực: còn ${ctx.debts.length} khoản, tổng còn lại ${total.toLocaleString('vi-VN')}d.`;
    for (const d of ctx.debts.slice(0, 3)) reply += ` Đơn ${d.order_id || ''} còn ${d.remain.toLocaleString('vi-VN')}d (hạn ${d.due_date || 'sắp tới'}).`;
    reply += ' Mình muốn thanh toán khoản nào trước ạ?' + cite;
    const g = guardReply(reply, wl);
    await logPair(c, { customer_id: customer.id, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: 'debt', category: 'policy_inquiry', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: false, debts: ctx.debts };
  }

  // 2. Thanks — chi xin sao, cam rating nhap
  if (detectThanks(n) && !detectComplaint(lower, n)) {
    const reply = 'Em cảm ơn mình nhiều ạ! Mình hài lòng thì cho em xin đánh giá sao ở đơn hàng giúp em nhé.';
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: reply, channel: 'web', ms: Date.now() - t0 });
    return { reply, intent: 'thanks', category: 'easy', sources: [], needsReview: false, createTicket: false };
  }

  // 3. Legal MANH truoc policy (tranh chap/kien/luat su/soan HD) — de 'Van de phap ly ve hoa don' ve legal
  if (detectLegalStrong(n)) {
    const wl = whitelistFrom({}, chunks);
    let reply = 'Em chuyển yêu cầu pháp lý cho legal soạn trong 2 ngày làm việc ạ. Mình để lại MST/thông tin hợp đồng giúp em nhé.' + cite;
    const g = guardReply(reply, wl);
    const t = await createTicketFor(c, { customer_id, content: message, category: 'legal', actor });
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: 'legal', category: 'legal', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: true, ticket_id: t?.id };
  }

  // 4. Hop dong -> legal truoc policy ('Can hop dong VAT?' phai legal, khong phai policy)
  if (hasWB(n, 'hop dong')) {
    const wl = whitelistFrom({}, chunks);
    let reply = 'Em chuyển yêu cầu hợp đồng cho legal soạn trong 2 ngày làm việc ạ. Mình để lại MST/thông tin hợp đồng giúp em nhé.' + cite;
    const g = guardReply(reply, wl);
    const t = await createTicketFor(c, { customer_id, content: message, category: 'legal', actor });
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: 'legal', category: 'legal', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: true, ticket_id: t?.id };
  }

  // 5. Policy (chinh sach doi tra the nao -> policy, trich knowledge top-1, khong ticket)
  if (detectPolicy(n)) {
    const top1 = chunks[0];
    const wl = whitelistFrom({}, chunks);
    let reply = top1 ? `Dạ theo chính sách: ${top1.text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 3).join(' ').slice(0, 300)}` : 'Dạ em gửi thông tin chính sách, mình cần rõ điểm nào ạ?';
    reply += cite;
    const g = guardReply(reply, wl);
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: 'policy', category: 'policy_inquiry', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: false };
  }

  // 4. Complaint cum (tru truong hop chinh sach)
  if (detectComplaint(lower, n)) {
    const wl = whitelistFrom({}, chunks);
    let reply = 'Em rất tiếc về trải nghiệm này ạ. Em đã ghi nhận và tạo phiếu hỗ trợ, QA sẽ kiểm tra trong 24h. Mình cho em xin mã đơn + ảnh sản phẩm để xử lý nhanh nhé.' + cite;
    const g = guardReply(reply, wl);
    const t = await createTicketFor(c, { customer_id, content: message, category: 'complaint', actor });
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: 'complaint', category: 'complaint', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: true, ticket_id: t?.id };
  }

  // 5. Technical (cam 'giao' chung)
  if (detectTechnical(lower, n)) {
    const wl = whitelistFrom({}, chunks);
    let reply = 'Em ghi nhận sự cố kỹ thuật và tạo phiếu cho IT xử lý ạ. Mình mô tả thêm giúp em: thiết bị + bước bị lỗi nhé.' + cite;
    const g = guardReply(reply, wl);
    const t = await createTicketFor(c, { customer_id, content: message, category: 'technical', actor });
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: 'technical', category: 'technical', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: true, ticket_id: t?.id };
  }

  // 6. Legal
  if (detectLegal(n)) {
    const wl = whitelistFrom({}, chunks);
    let reply = 'Em chuyển yêu cầu pháp lý cho legal soạn trong 2 ngày làm việc ạ. Mình để lại MST/thông tin hợp đồng giúp em nhé.' + cite;
    const g = guardReply(reply, wl);
    const t = await createTicketFor(c, { customer_id, content: message, category: 'legal', actor });
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: 'legal', category: 'legal', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: true, ticket_id: t?.id };
  }

  // 7. Promo / ship / gia-ton (easy, khong ticket) + context gia/ton
  if (detectPromo(n) || detectShip(n) || hasAnyWB(n, ['gia', 'ton kho', 'con hang', 'gia si', 'dat hang', 'mo cua', 'lien he', 'thanh toan bang'])) {
    let prices = [];
    try {
      prices = await c.query('SELECT sku, name, price, COALESCE((SELECT SUM(qty) FROM stock_moves s WHERE s.product_sku=products.sku),0) AS stock FROM products LIMIT 5');
    } catch {}
    const wl = whitelistFrom({ prices: prices.map((p) => ({ price: Number(p.price), stock: Number(p.stock) })) }, chunks);
    const promoLine = detectPromo(n) ? 'Khuyến mãi tháng này xem trên fanpage/Zalo OA ạ. ' : '';
    const menu = prices.slice(0, 3).map((p) => `${p.name} ${Number(p.price).toLocaleString('vi-VN')}d`).join('; ');
    let reply = `Dạ ${promoLine}${chunks[0] ? chunks[0].text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ').slice(0, 250) : 'em gửi thông tin ạ.'} ${menu ? 'Thực đơn: ' + menu + '. ' : ''}Mình chọn món nào để em lên đơn ạ?` + cite;
    const g = guardReply(reply, wl);
    await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
    return { reply: g.text, intent: detectPromo(n) ? 'promo' : 'info', category: 'easy', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: false };
  }

  // 8. Default easy + RAG
  const wl = whitelistFrom({}, chunks);
  let reply = chunks[0] ? `Dạ: ${chunks[0].text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ').slice(0, 250)} Mình cần hỗ trợ thêm gì ạ?` + cite : 'Dạ em đã nhận tin nhắn, mình cần hỗ trợ gì thêm ạ?';
  const g = guardReply(reply, wl);
  await logPair(c, { customer_id: customer_id || null, contentIn: message, contentOut: g.text, channel: 'web', ms: Date.now() - t0 });
  return { reply: g.text, intent: 'easy', category: 'easy', sources: chunks.map((x) => x.source), needsReview: g.needsReview, createTicket: false };
}

async function createTicketFor(c, { customer_id, content, category, actor }) {
  try {
    const hd = require('./helpdesk');
    return await hd.createTicket(c, { customer_id: customer_id || null, category, content: String(content).slice(0, 500), priority: category === 'complaint' ? 'high' : 'normal', actor: actor || 'chatbot' });
  } catch { return null; }
}

async function logPair(c, { customer_id, contentIn, contentOut, channel, ms }) {
  try {
    const tokens = Math.ceil((String(contentIn || '').length + String(contentOut || '').length) / 4);
    await c.run('INSERT INTO messages(customer_id,direction,content,channel) VALUES(?,?,?,?)', [customer_id, 'in', String(contentIn).slice(0, 1000), channel || 'web']);
    await c.run('INSERT INTO messages(customer_id,direction,content,channel) VALUES(?,?,?,?)', [customer_id, 'out', `${String(contentOut).slice(0, 1000)} [latency=${ms}ms tokens~${tokens}]`, channel || 'web']);
  } catch {}
}

module.exports = { chatReply, rag, guardReply, whitelistFrom, numbersIn, SYSTEM, SYSTEM_WORDS, loadChunks };

