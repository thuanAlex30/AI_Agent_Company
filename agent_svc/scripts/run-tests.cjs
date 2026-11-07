#!/usr/bin/env node
/**
 * run-tests.cjs — chay test suite theo cach TUONG THICH Node 20 VA Node 22.
 *
 * VAN DE (da xac nhan tren CI run 42340162280, job `agent`):
 *   - Node 20: `node --test tests/` (thu muc) => OK.
 *   - Node 22: `node --test tests/` => FAIL:
 *       Error: Cannot find module '.../agent_svc/tests'
 *       (Node 22 khong resolve duoc directory argument cho test runner).
 *   - Node 20 khong ho tro glob cho `node --test`.
 *   => Khong co lenh `node --test` nao giong nhau tren ca 2 phien ban.
 *
 * CACH GIAI:
 *   Tu liet ke `tests/*.test.js` roi spawn `node --test --test-concurrency=1`
 *   voi danh sach file TUONG MINH (Node 20 + Node 22 deu chap nhan).
 *   - KHONG bo test, KHONG dung `|| true`, KHONG lam test pass gia.
 *
 * Dung trong package.json:
 *   "test": "node scripts/run-tests.cjs"
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = path.join(ROOT, 'tests');

function collectTestFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    console.error(`[run-tests] khong doc duoc thu muc test: ${dir} (${e.message})`);
    process.exit(1);
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile()) continue;
    if (entry.name.endsWith('.test.js')) out.push(path.join(dir, entry.name));
  }
  return out;
}

const files = collectTestFiles(TESTS_DIR);

if (!files.length) {
  console.error(`[run-tests] KHONG tim thay file test nao trong ${TESTS_DIR}`);
  console.error('[run-tests] Dung co test that su — khong de job CI "xanh gia".');
  process.exit(1);
}

console.log(`[run-tests] node ${process.version} — ${files.length} file test:`);
for (const f of files) console.log(`  - ${path.relative(ROOT, f).replace(/\\/g, '/')}`);

const args = ['--test', '--test-concurrency=1', ...files];
const res = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  cwd: ROOT,
  env: process.env,
});

if (res.error) {
  console.error(`[run-tests] khong chay duoc node --test: ${res.error.message}`);
  process.exit(1);
}

process.exit(typeof res.status === 'number' ? res.status : 1);
