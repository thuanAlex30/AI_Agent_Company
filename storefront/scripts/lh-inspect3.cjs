const fs = require('fs');
const file = process.argv[2] || (process.env.TEMP + '/lh-detail.json');
const r = JSON.parse(fs.readFileSync(file, 'utf8'));
const a = r.audits;
const rb = a['render-blocking-resources'];
if (rb && rb.details) {
  console.log('--- render-blocking items ---');
  for (const it of rb.details.items) {
    console.log('url:', it.url);
    console.log('wastedMs:', it.wastedMs, 'totalBytes:', it.totalBytes);
    console.log('duration:', JSON.stringify(it.duration));
  }
} else console.log('no render-blocking audit');
console.log('--- LCP elem ---');
const le = a['largest-contentful-paint-element'];
if (le && le.details) console.log(JSON.stringify(le.details.items, null, 1).slice(0, 1200));
console.log('--- font-display / cls culprits ---');
console.log('non-composited animations:', JSON.stringify((a['non-composited-animations'] || {}).details?.items || []));
console.log('layout shift elements:', JSON.stringify((a['layout-shifts'] || {}).details?.items || []).slice(0, 600));
