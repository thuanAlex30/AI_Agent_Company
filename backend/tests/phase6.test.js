// phase6.test.js — Phase 6 (OPS/CI): CONTAINER HARDENING, LOGGING, READINESS.
//
//   p601: /api/ready tra checks.agent + phan biet degraded
//   p602: log moi dong co request_id
//   p603: quyet dinh RBAC 403 duoc log (user/role/dept/resource)
//   p604: X-Request-Id header duoc gan cho moi request
//   p605: version trong /api/health khop config.APP_VERSION
//   p606: contract 3 ban giong het nhau
const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/server');
const logger = require('../src/common/logger');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');

// ---------------------------------------------------------------------------
// p601: /api/ready tra checks.agent + degraded
// ---------------------------------------------------------------------------
test('p601: /api/ready kiem tra ca agent (checks.agent) va phan biet degraded', async () => {
  const r = await request(app).get('/api/ready');
  assert.ok([200, 503].includes(r.status), 'status phai 200 hoac 503');
  assert.ok(r.body.checks, 'phai co checks');
  assert.ok('db' in r.body.checks, 'phai co checks.db');
  assert.ok('agent' in r.body.checks, 'phai co checks.agent');
  assert.ok(r.body.status, 'phai co status');
  // Agent chua chay trong test => agent=false => status phai 'degraded'
  // (DB van OK) — chung to readiness phan biet dependency.
  if (r.status === 200) {
    assert.equal(r.body.checks.agent, false, 'agent offline => checks.agent=false');
    assert.equal(r.body.status, 'degraded');
  }
});

// ---------------------------------------------------------------------------
// p602: log moi dong co request_id
// ---------------------------------------------------------------------------
test('p602: moi dong log co request_id', async () => {
  const orig = console.log;
  const lines = [];
  console.log = (l) => lines.push(String(l));
  try {
    logger.info('phase6 test log', { foo: 'bar' });
  } finally {
    console.log = orig;
  }
  assert.ok(lines.length === 1, 'phai co 1 dong log');
  assert.match(lines[0], /\[rid=/, 'log phai co [rid=...]');
  assert.match(lines[0], /request_id/, 'log phai co truong request_id');
});

// ---------------------------------------------------------------------------
// p603: quyet dinh RBAC 403 duoc log
// ---------------------------------------------------------------------------
test('p603: quyet dinh RBAC 403 duoc log kem user/role/dept/resource', async () => {
  const orig = console.warn;
  const lines = [];
  console.warn = (l) => lines.push(String(l));
  try {
    const { requirePerm } = require('../src/common/auth');
    await new Promise((resolve) => {
      requirePerm('debts.write')(
        { user: { role: 'warehouse', username: 'p6kho', dept_code: 'supply' }, method: 'POST', originalUrl: '/api/debts', requestId: 'rid-test-1' },
        {},
        (err) => { assert.ok(err); assert.equal(err.status, 403); resolve(); }
      );
    });
  } finally {
    console.warn = orig;
  }
  const hit = lines.find((l) => l.includes('RBAC 403'));
  assert.ok(hit, 'phai co dong log "RBAC 403", thay: ' + JSON.stringify(lines));
  assert.match(hit, /"role":"warehouse"/, 'log kem role');
  assert.match(hit, /"user":"p6kho"/, 'log kem user');
  assert.match(hit, /"dept":"supply"/, 'log kem dept');
  assert.match(hit, /"resource":"\/api\/debts"/, 'log kem resource');
});

// ---------------------------------------------------------------------------
// p604: X-Request-Id header duoc gan cho moi request
// ---------------------------------------------------------------------------
test('p604: moi request deu co header X-Request-Id', async () => {
  const r = await request(app).get('/api/health');
  assert.equal(r.status, 200);
  assert.ok(r.headers['x-request-id'], 'phai co header X-Request-Id');
  assert.match(r.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

// ---------------------------------------------------------------------------
// p605: version trong /api/health khop config.APP_VERSION
// ---------------------------------------------------------------------------
test('p605: /api/health + /api/ready cung version config.APP_VERSION', async () => {
  const { APP_VERSION } = require('../src/config');
  const h = await request(app).get('/api/health');
  assert.equal(h.body.data.version, APP_VERSION);
  const rd = await request(app).get('/api/ready');
  assert.equal(rd.body.version, APP_VERSION);
});

// ---------------------------------------------------------------------------
// p606: contract 3 ban giong het nhau
// ---------------------------------------------------------------------------
test('p606: 3 ban contract (root/backend/agent_svc) giong het nhau', () => {
  const names = ['roles-permissions.json', 'manifest.json', 'approval-matrix.json', 'enums.json',
    'table-ownership.json', 'traceability.csv', 'state-machines.md', 'invariants.sql', 'openapi.yaml'];
  for (const n of names) {
    const a = fs.readFileSync(path.join(REPO, 'docs', 'contract', n), 'utf8');
    const b = fs.readFileSync(path.join(ROOT, 'docs', 'contract', n), 'utf8');
    const c = fs.readFileSync(path.join(REPO, 'agent_svc', 'docs', 'contract', n), 'utf8');
    assert.equal(a, b, 'contract lech: root vs backend — ' + n);
    assert.equal(a, c, 'contract lech: root vs agent_svc — ' + n);
  }
});
