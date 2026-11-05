const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const hr = require('../src/modules/hr/service');

test('hr1: cham ho bi chan 403', async () => {
  const sale = { id: 4, username: 'sale', role: 'sales', employee_code: 'NV101' };
  await assert.rejects(() => hr.checkin(null, sale, 'NV102'), (e) => e.status === 403);
  // tu cham duoc
  const r = await hr.checkin(null, sale, 'NV101');
  assert.ok(r.id && ['present', 'late'].includes(r.status));
});

test('hr2: hr duoc cham ho + payroll loc luong voi sales', async () => {
  const hrUser = { id: 21, username: 'hr', role: 'hr', employee_code: 'HRM001' };
  const r = await hr.checkin(null, hrUser, 'NV102');
  assert.ok(r.id);
  const sale = { role: 'sales' };
  const preview = await hr.payrollPreview(null, sale);
  assert.ok(preview.length > 0);
  assert.equal(preview[0].salary_base, undefined, 'sales bi an salary_base');
  const ceo = { role: 'ceo' };
  const preview2 = await hr.payrollPreview(null, ceo);
  assert.ok(preview2[0].salary_base !== undefined, 'ceo duoc thay luong');
  // hr khong write users: module hr khong chua INSERT/UPDATE/DELETE bang users
  const src = require('fs').readFileSync('src/modules/hr/service.js', 'utf8');
  assert.ok(!/INSERT\s+INTO\s+users|UPDATE\s+users|DELETE\s+FROM\s+users|INSERT\s+INTO\s+refresh_tokens/i.test(src), 'hr cam write users/refresh_tokens');
});
