import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { postChat } from '../services/api.js';
import Icon from './ui/Icon.jsx';
import Button from './ui/Button.jsx';

// SEC-01: KHONG co o/quick-question nao hoi "cong no theo SDT".
// Chi huong khach sang trang Tra cuu don (2 yeu to).
const QUICK = [
  { label: 'Xem menu', go: '/san-pham' },
  { label: 'Đặt món thế nào?', go: null },
  { label: 'Đơn của tôi đâu?', go: '/tra-cuu' },
  { label: 'Khuyến mãi nào?', go: '/khuyen-mai' },
  { label: 'Đặt teabreak', go: '/dich-vu' },
];

const ANSWERS = {
  'Đặt món thế nào?': 'Chọn món ở Thực đơn → Giỏ → Thanh toán (tên + SĐT + địa chỉ) → nhận mã DHW để tra cứu. Giá do server quyết định lúc checkout.',
};

const LS_KEY = 'bizops-chat-v1';
const MAX_LEN = 500;

function loadHist() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(v) ? v.slice(-30) : [];
  } catch { return []; }
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(() => {
    const h = loadHist();
    return h.length ? h : [{ me: false, text: 'Em chào mình ạ! Em hỗ trợ đặt món, tra cứu đơn, teabreak. Mình hỏi em nhé.' }];
  });
  const [inp, setInp] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(msgs.slice(-30))); } catch {}
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [msgs, open]);

  // Nut "Mo chat CSKH" tu trang Ho tro
  useEffect(() => {
    const fn = () => setOpen(true);
    window.addEventListener('bizops-open-chat', fn);
    return () => window.removeEventListener('bizops-open-chat', fn);
  }, []);

  async function send(text, go) {
    const q = (text ?? inp).trim();
    if (!q || busy) return;
    setInp('');
    setMsgs((m) => [...m, { me: true, text: q }]);

    if (go) {
      setMsgs((m) => [...m, { me: false, text: `Dạ, em mở trang ${q} cho mình nhé.`, go }]);
      return;
    }
    if (ANSWERS[q]) {
      setMsgs((m) => [...m, { me: false, text: ANSWERS[q] }]);
      return;
    }

    setBusy(true);
    const typingId = Date.now();
    setMsgs((m) => [...m, { me: false, text: '…', typing: typingId }]);
    try {
      const d = await postChat({ message: q.slice(0, MAX_LEN) });
      setMsgs((m) => m.filter((x) => x.typing !== typingId).concat([
        { me: false, text: d.reply || 'Em đã nhận, CSKH phản hồi sớm ạ.' },
      ]));
    } catch (ex) {
      // 429 / 5xx / mat mang -> thong bao ro rang cho khach
      const msg = ex && ex.code === 'RATE_LIMIT'
        ? 'Bạn hỏi hơi nhanh, em cần nghỉ chút. Thử lại sau ít phút nhé.'
        : (ex && ex.status >= 500)
          ? 'Hệ thống đang bận, em chưa trả lời được. Bạn thử lại sau hoặc gọi hotline 1900-xxxx.'
          : 'Mạng bận, mình thử lại hoặc gọi hotline 1900-xxxx nhé.';
      setMsgs((m) => m.filter((x) => x.typing !== typingId).concat([{ me: false, text: msg }]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fab">
        <button type="button" aria-label={open ? 'Đóng chat hỗ trợ' : 'Mở chat hỗ trợ'} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'close' : 'chat'} size={24} />
        </button>
        <button type="button" className="secondary" aria-label="Lên đầu trang" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <Icon name="arrowUp" size={22} />
        </button>
      </div>

      {open ? (
        <div className="chatbox" role="dialog" aria-label="Chat hỗ trợ">
          <header>
            <span>CSKH BizOps Café {busy ? '· đang trả lời…' : '· online'}</span>
            <button type="button" className="xbtn" aria-label="Đóng chat" onClick={() => setOpen(false)}>
              <Icon name="close" size={18} />
            </button>
          </header>

          <div className="chatlog" ref={logRef} aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={m.me ? 'msg me' : 'msg' + (m.typing ? ' typing' : '')}>
                {m.typing ? (
                  <span className="dots"><span>.</span><span>.</span><span>.</span></span>
                ) : m.text}
                {m.go ? (
                  <div>
                    <Button size="sm" onClick={() => { setOpen(false); nav(m.go); }}>Mở ngay →</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="quickq">
            {QUICK.map((q) => (
              <button key={q.label} type="button" onClick={() => send(q.label, q.go)}>{q.label}</button>
            ))}
          </div>

          <form className="chatform" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <input
              aria-label="Nhắn tin"
              value={inp}
              onChange={(e) => setInp(e.target.value)}
              placeholder="Nhắn tin… (vd: combo sáng còn không?)"
              maxLength={MAX_LEN}
            />
            <Button size="sm" type="submit" loading={busy} disabled={busy}>Gửi</Button>
          </form>
        </div>
      ) : null}
    </>
  );
}
