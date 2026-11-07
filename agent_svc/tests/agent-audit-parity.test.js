const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const fs = require('fs');
const path = require('path');

// SEC-12: agent parity — audit fail-closed + insertedId + khong fallback ID + khong ham date DB.
test('agent-parity1: writeAudit fail-closed (thieu conn -> GOV 500)', async () => {
  const { writeAudit } = require('../src/audit');
  await assert.rejects(() => writeAudit(null, 't', 'create', 'tickets', 1, null, {}), (e) => e.code === 'GOV' && e.status === 500);
  await assert.rejects(() => writeAudit({}, 't', 'create', 'tickets', 1, null, {}), (e) => e.code === 'GOV');
});

test('agent-parity2: db co insertedId + withReturning + lock + khong fallback DO NOTHING', async () => {
  const db = require('../src/db');
  assert.equal(typeof db.insertedId, 'function', 'thieu insertedId');
  assert.equal(typeof db.tx, 'function', 'thieu tx');
  assert.equal(typeof db.withReturning, 'function', 'thieu withReturning');
  assert.equal(typeof db.withForUpdate, 'function', 'thieu withForUpdate');
  // ON CONFLICT DO NOTHING van giu RETURNING id (PG ho tro) — tru bang khong co id.
  assert.ok(db.withReturning('INSERT INTO tickets(code) VALUES(?) ON CONFLICT DO NOTHING').includes('RETURNING id'));
  assert.ok(!db.withReturning('INSERT INTO products(sku) VALUES(?) ON CONFLICT DO NOTHING').includes('RETURNING id'));
  // insertedId fail-fast thay vi tra undefined.
  await assert.rejects(
    (async () => db.insertedId({ changes: 0, lastInsertRowid: undefined }, 'tickets', 't'))(),
    (e) => e.code === 'INTERNAL'
  );
  assert.equal(db.insertedId({ changes: 1, lastInsertRowid: 7 }), 7);
});

test('agent-parity3: src khong con fallback lay ID + khong ham date DB', async () => {
  const walk = (d, out = []) => {
    if (!fs.existsSync(d)) return out;
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (['node_modules', '.git', 'data'].includes(f.name)) continue; walk(p, out); }
      else if (f.name.endsWith('.js')) out.push(p);
    }
    return out;
  };
  const files = walk(path.join(__dirname, '..', 'src'));
  const badId = [];
  const badDate = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    if (/lastInsertRowid\s*\|\|/.test(code)) badId.push(path.basename(f) + ': lastInsertRowid ||');
    if (/SELECT\s+id\s+FROM[\s\S]{0,120}?ORDER BY\s+id\s+DESC\s+LIMIT\s+1/i.test(code)) {
      badId.push(path.basename(f) + ': SELECT id ... ORDER BY id DESC LIMIT 1');
    }
    for (const fn of ['datetime(', 'date(', 'strftime(', 'julianday(', 'CURRENT_TIMESTAMP']) {
      // Cho phep `nowISO()` app-level; chi cam goi truc tiep trong SQL string.
      const re = new RegExp(fn.replace('(', '\\('), 'i');
      const lines = code.split('\n');
      for (const l of lines) {
        if ((l.includes('SELECT') || l.includes('INSERT') || l.includes('UPDATE')) && re.test(l)) {
          badDate.push(path.basename(f) + ': ' + fn + ' trong SQL');
          break;
        }
      }
    }
  }
  assert.deepEqual(badId, [], 'con fallback lay ID: ' + badId.join(' | '));
  assert.deepEqual(badDate, [], 'con ham date DB trong src: ' + badDate.join(' | '));
});

test('agent-parity4: createTicket + addRating boc tx (ticket + audit atomic)', async () => {
  const hdSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'brain', 'helpdesk.js'), 'utf8');
  assert.ok(/db\.tx\(doCreate\)/.test(hdSrc), 'createTicket goi truc tiep phai boc db.tx');
  assert.ok(/db\.tx\(doAdd\)/.test(hdSrc), 'addRating goi truc tiep phai boc db.tx');
  assert.ok(/db\.insertedId\(r, 'ratings', 'addRating'\)/.test(hdSrc), 'addRating phai dung insertedId');
});
