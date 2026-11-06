// CSKH AI: rule-based chạy ngay, LLM (OpenAI) khi có key
const OpenAI = require('openai');

const SCRIPTS = [
  { k: ['gia', 'bao gia', 'price'], a: 'Dạ bên em gửi bảng giá cơ bản. Anh/chị cho em số lượng + địa chỉ giao để em báo giá tốt nhất ạ.' },
  { k: ['giao', 'ship', 'van chuyen'], a: 'Dạ đơn nội thành 1-2 ngày, tỉnh 2-4 ngày. Anh/chị cho em địa chỉ để em check phí ship chính xác ạ.' },
  { k: ['no', 'cong no', 'thanh toan', 'chuyen khoan'], a: 'Dạ để em kiểm tra công nợ giúp mình ngay. Mình cho em xin mã đơn hoặc SĐT đặt hàng ạ.' },
  { k: ['doi tra', 'bao hanh', 'loi', 'hong'], a: 'Dạ em rất tiếc về trải nghiệm này. Anh/chị gửi giúp em ảnh/video + mã đơn, em tạo phiếu hỗ trợ ưu tiên ạ.' },
  { k: ['cam on', 'thank'], a: 'Dạ em cảm ơn anh/chị nhiều ạ! Nếu hài lòng anh/chị cho em xin 1 đánh giá 5 sao nhé!' },
];

async function chatReply(db, customerId, text) {
  db.prepare('INSERT INTO messages (customer_id,direction,content) VALUES (?,?,?)').run(customerId || null, 'in', text);
  const t = (text || '').toLowerCase();
  let rule = SCRIPTS.find(s => s.k.some(k => t.includes(k)));
  let reply;
  if (process.env.OPENAI_API_KEY) {
    try {
      const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const r = await ai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Bạn là nhân viên CSKH SME Việt Nam: lễ phép, ngắn gọn, xưng em, luôn chốt hành động tiếp theo (xin SĐT/mã đơn/ảnh).' },
          { role: 'user', content: text }
        ], max_tokens: 250
      });
      reply = r.choices[0].message.content;
    } catch { reply = rule ? rule.a : fallback(); }
  } else {
    reply = rule ? rule.a : fallback();
  }
  db.prepare('INSERT INTO messages (customer_id,direction,content) VALUES (?,?,?)').run(customerId || null, 'out', reply);
  // auto-tạo ticket nếu có dấu hiệu khiếu nại
  if (/loi|hong|doi tra|bao hanh|khieu nai|te /.test(t)) {
    db.prepare('INSERT INTO tickets (customer_id,subject,content,priority) VALUES (?,?,?,?)')
      .run(customerId || null, 'Khiếu nại tự động từ chat', text, 'high');
  }
  return reply;
}
function fallback() {
  return 'Dạ em đã nhận thông tin. Anh/chị cho em xin SĐT + mã đơn để em hỗ trợ chi tiết ngay ạ.';
}
module.exports = { chatReply };
