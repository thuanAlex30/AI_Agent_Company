// scripts/stability.cjs — Do CPU benchmark lap 8 lan de kiem do may co on dinh khong.
// Neu do doc lech nhieu -> phai dung median so lan va KHONG duoc tin 1 lan.
const os = require('os');
function spin(ms) {
  const t = Date.now();
  let x = 0;
  while (Date.now() - t < ms) { x += Math.sqrt(x + 1); }
  return x;
}
(async () => {
  const ROUNDS = Number(process.argv[2] || 8);
  const samples = [];
  for (let i = 0; i < ROUNDS; i++) {
    const t = Date.now();
    spin(150);
    samples.push(Date.now() - t);
  }
  const s = [...samples].sort((a, b) => a - b);
  console.log('spin(150ms) actual:', samples.join(', '));
  console.log('min', s[0], 'median', s[Math.floor(s.length / 2)], 'max', s[s.length - 1],
    '=> bien do', (((s[s.length - 1] - s[0]) / s[0]) * 100).toFixed(1) + '%');
  console.log('loadavg', os.loadavg().map((x) => x.toFixed(2)).join(' '));
})();
