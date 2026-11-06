import { useState } from 'react';
import { postChat } from '../services/api.js';

const QUICK = ['Xem menu', 'Đặt món thế nào?', 'Đơn của tôi đâu?', 'Khuyến mãi nào?'];

const ANSWERS = {
  'Xem menu': 'Thực đơn: Cà phê sữa 35k, Trà đào 40k, Bánh ngọt 25k, Combo sáng 55k. Mình xem ở mục Thực đơn nhé.',
  'Đặt món thế nào?': 'Chọn món ở Thực đơn → Giỏ → Thanh toán (tên + SĐT + địa chỉ) → nhận mã DHW để tra cứu.',
  'Đơn của tôi đâu?': 'Mình vào Tra cứu, nhập mã DHW + SĐT/email đã đặt để xem timeline nhé.',
  'Khuyến mãi nào?': 'Web 7h-9h cà phê sữa còn 32k, combo sáng tiết kiệm. Chi tiết ở mục Khuyến mãi.',
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ me: false, text: 'Em chào mình ạ! Em hỗ trợ đặt món, tra cứu đơn, teabreak.' }]);
  const [inp, setInp] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(text) {
    const q = (text ?? inp).trim();
    if (!q || busy) return;
    setInp('');
    setMsgs((m) => [...m, { me: true, text: q }]);
    if (ANSWERS[q]) {
      setMsgs((m) => [...m, { me: false, text: ANSWERS[q] }]);
      return;
    }
    setBusy(true);
    try {
      const d = await postChat({ message: q.slice(0, 500) });
      setMsgs((m) => [...m, { me: false, text: d.reply || 'Em đã nhận, CSKH phản hồi sớm ạ.' }]);
    } catch {
      setMsgs((m) => [...m, { me: false, text: 'Mạng bận, mình thử lại hoặc gọi hotline 1900-xxxx nhé.' }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="fab">
        <button aria-label="Chat hỗ trợ" onClick={() => setOpen((o) => !o)}>💬</button>
        <button aria-label="Lên đầu trang" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>↑</button>
      </div>
      {open && (
        <div className="chatbox" role="dialog" aria-label="Chat hỗ trợ">
          <header>CSKH BizOps Café {busy ? '…' : ''}</header>
          <div className="chatlog">
            {msgs.map((m, i) => <div key={i} className={m.me ? 'msg me' : 'msg'}>{m.text}</div>)}
          </div>
          <div className="quickq">
            {QUICK.map((q) => <button key={q} onClick={() => send(q)}>{q}</button>)}
          </div>
          <form className="chatform" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input aria-label="Nhắn tin" value={inp} onChange={(e) => setInp(e.target.value)} placeholder="Nhắn tin…" maxLength={500} />
            <button className="btn small" type="submit" disabled={busy}>Gửi</button>
          </form>
        </div>
      )}
    </>
  );
}
