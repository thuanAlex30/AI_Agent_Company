const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.env.TEMP + '/lh-detail.json', 'utf8'));
for (const [id, a] of Object.entries(r.audits)) {
  if (a.details && a.details.type === 'opportunity' && a.details.overallSavingsMs > 0) {
    console.log(id, '->', Math.round(a.details.overallSavingsMs) + 'ms', '|', a.title);
  }
}
console.log('--- metrics ---');
console.log(JSON.stringify(r.audits['metrics'] && r.audits['metrics'].details.items[0], null, 1));
console.log('--- bootup ---');
const b = r.audits['bootup-time'];
if (b && b.details) for (const i of b.details.items) console.log(i.url.split('/').pop(), Math.round(i.total), Math.round(i.scripting), Math.round(i.scriptParseCompile));
console.log('--- network dependency tree ---');
const ndt = r.audits['network-dependency-tree'];
if (ndt && ndt.details) console.log(JSON.stringify(ndt.details.items, null, 1).slice(0, 2000));
