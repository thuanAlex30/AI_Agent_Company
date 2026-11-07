const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.env.TEMP + '/lh-detail.json', 'utf8'));
const items = (r.audits['network-requests'] && r.audits['network-requests'].details.items) || [];
for (const x of items) {
  if (x.resourceType === 'Font' || x.resourceType === 'Stylesheet' || x.resourceType === 'Document' || x.resourceType === 'Script') {
    console.log(x.resourceType.padEnd(11), String(x.url.split('/').pop()).padEnd(32),
      'start=' + Math.round(x.networkRequestTime),
      'end=' + Math.round(x.networkEndTime),
      'dur=' + Math.round(x.networkEndTime - x.networkRequestTime),
      'size=' + x.transferSize);
  }
}
console.log('--- main-thread ---');
const mt = r.audits['mainthread-work-breakdown'];
if (mt && mt.details && mt.details.items) {
  for (const i of mt.details.items) console.log(i.groupLabel, Math.round(i.duration) + 'ms');
}
