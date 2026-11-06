const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const pub = require('../src/brain/public');

// SEC-01 v7: kenh cong khai KHONG BAO GIO tra so tien cong no.
// >=20 bien the: khong dau, tach so, +84, nhung cau dai, qua contact, nhieu luot.
const VARIANTS = [
  'công nợ của tôi 0912345678',
  'cong no cua toi 0912345678',
  'xem nợ giúp tôi 0912 345 678',
  'tôi còn nợ bao nhiêu? sdt +84912345678',
  'kiểm tra dư nợ đơn của tôi: 09-12-34-56-78',
  'cho xem no cua minh 0912345678 nhe',
  'tra cuu cong no giup toi voi 0912345678',
  'em oi cong no cua chi la bao nhieu 0912345678?',
  'con thieu bao nhieu tien vậy shop 0912345678',
  'han thanh toan cua toi khi nao 0912345678',
  'du no hien tai cua sdt 0912345678 la may',
  'khai ma KH001, cho xem nợ',
  'toi khai ma khach hang roi cho xem cong no di',
  'xem cong no cua so dien thoai 0912.345.678 giup',
  'CONG NO CUA TOI 0912345678!!!',
  'shop oi cho hoi cong no:0912345678?',
  'minh mua tuan truoc, con no bao nhieu 0912345678',
  'tra no the nao, con thieu may 0912345678',
  'cho xem du no don hang cua toi 0912345678 nhe shop',
  'kiem tra cong no ho em 0912345678 voi a',
];

test('sec01: >=20 bien the hoi no qua chat public -> khong lo so tien, huong Tra cuu', async () => {
  for (const msg of VARIANTS) {
    const r = await pub.publicChatReply(null, { message: msg, actor: 'sec01-test' });
    const t = String(r.reply || '');
    assert.ok(!/\d[\d.,]{3,}\s*(đ|vnd|vnđ)/i.test(t), `LO SO TIEN: "${msg}" -> ${t.slice(0, 160)}`);
    assert.ok(!['debt'].includes(r.intent), `intent debt bi cam: "${msg}"`);
    assert.ok(/tra cuu|DHW|bao mat/i.test(t), `phai huong Tra cuu: "${msg}" -> ${t.slice(0, 160)}`);
  }
});

test('sec01b: gui qua truong contact cung khong lo so', async () => {
  const r = await pub.publicChatReply(null, { message: 'xem cong no giup toi', contact: '0912345678', actor: 'sec01-test' });
  const t = String(r.reply || '');
  assert.ok(!/\d[\d.,]{3,}\s*(đ|vnd|vnđ)/i.test(t), 'contact field cung khong lo so: ' + t.slice(0, 160));
});

test('sec01c: hoi nhieu luot van khong lo', async () => {
  const r1 = await pub.publicChatReply(null, { message: 'cong no cua toi', actor: 'sec01-test' });
  assert.ok(!/\d{5,}d/.test(String(r1.reply || '')));
  const r2 = await pub.publicChatReply(null, { message: '0912345678', contact: '0912345678', actor: 'sec01-test' });
  const t2 = String(r2.reply || '');
  assert.ok(!/\d[\d.,]{3,}\s*(đ|vnd|vnđ)/i.test(t2), 'luot 2 khong lo: ' + t2.slice(0, 160));
});
