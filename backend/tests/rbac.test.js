const test = require('node:test');
const assert = require('node:assert/strict');
require('./setup');
const { requirePerm, userPermissions } = require('../src/common/auth');

function can(role, perm) {
  return new Promise((resolve) => {
    requirePerm(perm)({ user: { role } }, {}, (err) => resolve(!err));
  });
}

test('rbac1: truong phong (manager) duoc viet theo khoi, cam tien', async () => {
  assert.equal(await can('manager', 'orders.write'), true);
  assert.equal(await can('manager', 'stock.write'), true);
  assert.equal(await can('manager', 'tickets.write'), true);
  assert.equal(await can('manager', 'qa.write'), true);
  assert.equal(await can('manager', 'sop.write'), true);
  assert.equal(await can('manager', 'productfeat.write'), true);
  assert.equal(await can('manager', 'payments.write'), false);
  assert.equal(await can('manager', 'debts.write'), false);
  assert.equal(await can('manager', 'budgets.write'), false);
  assert.equal(await can('manager', 'users.write'), false);
  assert.equal(await can('manager', 'audit.read'), false);
});

test('rbac2: nhan vien kho (warehouse) chi kho+van don+QA, cam don/tien', async () => {
  assert.equal(await can('warehouse', 'stock.write'), true);
  assert.equal(await can('warehouse', 'shipments.write'), true);
  assert.equal(await can('warehouse', 'products.write'), true);
  assert.equal(await can('warehouse', 'qa.write'), true);
  assert.equal(await can('warehouse', 'orders.write'), false);
  assert.equal(await can('warehouse', 'payments.write'), false);
  assert.equal(await can('warehouse', 'debts.write'), false);
  assert.equal(await can('warehouse', 'hr.read'), false);
  assert.equal(await can('warehouse', 'finance.read'), false);
});

test('rbac3: ke toan (accountant) giu tien, cam kho/don/audit', async () => {
  assert.equal(await can('accountant', 'payments.write'), true);
  assert.equal(await can('accountant', 'debts.write'), true);
  assert.equal(await can('accountant', 'expenses.write'), true);
  assert.equal(await can('accountant', 'finance.read'), true);
  assert.equal(await can('accountant', 'orders.write'), false);
  assert.equal(await can('accountant', 'stock.write'), false);
  assert.equal(await can('accountant', 'audit.read'), false);
  assert.equal(await can('accountant', 'users.write'), false);
});

test('rbac4: cskh chi ticket/chat, cam don/tien/luong', async () => {
  assert.equal(await can('cskh', 'tickets.write'), true);
  assert.equal(await can('cskh', 'chat.write'), true);
  assert.equal(await can('cskh', 'orders.read'), true);
  assert.equal(await can('cskh', 'orders.write'), false);
  assert.equal(await can('cskh', 'payments.write'), false);
  assert.equal(await can('cskh', 'hr.read'), false);
  assert.equal(await can('cskh', 'finance.read'), false);
});

test('rbac5: nhan vien chung (staff) chi QA/SOP/IT + cham cong', async () => {
  assert.equal(await can('staff', 'qa.write'), true);
  assert.equal(await can('staff', 'it.write'), true);
  assert.equal(await can('staff', 'attendance.checkin'), true);
  assert.equal(await can('staff', 'orders.write'), false);
  assert.equal(await can('staff', 'payments.write'), false);
  assert.equal(await can('staff', 'hr.read'), false);
  assert.equal(await can('staff', 'finance.read'), false);
});

test('rbac6: truong nhom (leader) chi duyet <5tr, khong viet users/budget', async () => {
  const perms = userPermissions('leader');
  assert.ok(perms.includes('approvals.decide'));
  assert.ok(perms.includes('approvals.request'));
  assert.equal(await can('leader', 'users.write'), false);
  assert.equal(await can('leader', 'budgets.write'), false);
  assert.equal(await can('leader', 'payments.write'), false);
});

test('rbac7: doc tai chinh/nhan su bi gioi han (sales/kho/cskh khong finance.read; coo/director duoc doc)', async () => {
  assert.equal(await can('coo', 'finance.read'), true);
  assert.equal(await can('director', 'finance.read'), true);
  assert.equal(await can('sales', 'finance.read'), false);
  assert.equal(await can('sales', 'hr.read'), false);
  assert.equal(await can('warehouse', 'finance.read'), false);
  assert.equal(await can('cskh', 'finance.read'), false);
  assert.equal(await can('hr', 'finance.read'), false);
  assert.equal(await can('hr', 'hr.read'), true);
  assert.equal(await can('cfo', 'finance.read'), true);
  assert.equal(await can('ceo', 'finance.read'), true);
  assert.equal(await can('owner', 'finance.read'), true);
});
