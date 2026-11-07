// scope.js — SEC-01: enforce department/resource scope SERVER-SIDE.
//
// Contract (docs/contract/roles-permissions.json) co "role_scopes" voi
// "dept": 'multi' | 'ceo' | 'sales' | ... nhung TRUOC DAY chi co requirePerm()
// (ma truyen role matrix) — khong co bat ky check nao theo phong ban.
// Hau qua (P1-05 / RBAC-SCOPE-001):
//   - Truong phong Sales doc duoc du lieu phong ban khac (chi can quyen orders.read)
//   - Doi URL ID (IDOR) van doc duoc record cua phong ban khac
//
// Co che:
//   1. resolveScope(user): tra { role, dept, allDepts, canReadOtherDept }
//      - role 'owner'/'ceo' -> allDepts = true
//      - role co dept cu the (accountant/finance, sales/sales, cskh/cskh,
//        hr/hr, warehouse/supply, legal/legal) -> chi doc du lieu dept do
//      - role 'multi' (manager/director/leader/staff/coo) -> theo khoi, doc
//        duoc phong ban cua user + phong ban con (subtree) -> xem SCOPE_DEPT_SUBTREE
//   2. enforceDept(user, deptCode): nem 403 neu deptCode khong nam trong scope
//   3. scopeFilter(user, rows, deptField): loc bo cac row thuoc ngoai scope
//   4. assertResourceScope(user, table, id): load resource, kiem tra dept cua
//      no thuoc scope user -> 403 (chong IDOR doi URL ID)
const fs = require('fs');
const path = require('path');
const { AppError } = require('./errors');

let rolesCache = null;
function loadRoles() {
  if (!rolesCache) {
    rolesCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs/contract/roles-permissions.json'), 'utf8'));
  }
  return rolesCache;
}

// Phong ban con truc tiep — dung de mo rong scope cho truong phong/giám đốc khối.
const SCOPE_DEPT_SUBTREE = {
  sales: ['sales', 'cskh', 'marketing'],
  marketing: ['marketing'],
  cskh: ['cskh'],
  supply: ['supply', 'ops'],
  ops: ['ops'],
  finance: ['finance'],
  hr: ['hr'],
  it: ['it'],
  legal: ['legal'],
  qa: ['qa'],
  product: ['product'],
  ceo: ['ceo', 'sales', 'marketing', 'cskh', 'ops', 'supply', 'finance', 'hr', 'it', 'legal', 'qa', 'product'],
};

/** Tra ve scope quyen doc theo phong ban cho 1 user. */
function resolveScope(user) {
  const role = user && user.role;
  const roles = loadRoles();
  const scopes = roles.role_scopes || {};
  const scope = scopes[role] || {};
  const declared = scope.dept || 'multi';

  // Quyet dinh danh sách phong ban được đọc.
  let depts;
  let allDepts = false;
  if (declared === 'multi') {
    // Vai "multi": phong ban cua chính user + subtree (nếu có).
    depts = user.dept_code ? [user.dept_code, ...(SCOPE_DEPT_SUBTREE[user.dept_code] || [])] : [];
  } else {
    depts = [declared];
    // Ngoai ra: coo/director theo khoi keu nhieu phong ban.
    if (declared === 'ceo' && (role === 'coo' || role === 'director' || role === 'manager')) {
      allDepts = true;
      depts = Object.keys(SCOPE_DEPT_SUBTREE).flatMap((d) => SCOPE_DEPT_SUBTREE[d]);
    }
  }
  if (role === 'owner' || role === 'ceo') allDepts = true;

  return {
    role,
    dept: declared,
    userDept: user.dept_code || null,
    allDepts,
    depts: Array.from(new Set(depts)),
  };
}

/**
 * Kiem tra mot phong ban co thuoc scope doc cua user khong.
 * @returns {boolean}
 */
function canAccessDept(user, deptCode) {
  const s = resolveScope(user);
  if (s.allDepts) return true;
  if (!deptCode) return s.depts.length === 0 ? false : true;
  return s.depts.includes(String(deptCode));
}

/** Nem AppError 403 neu phong ban khong thuoc scope. */
function enforceDept(user, deptCode, what = 'du lieu') {
  if (!deptCode) return true;
  if (canAccessDept(user, deptCode)) return true;
  throw new AppError('FORBIDDEN', `Ban khong co quyen truy cap ${what} cua phong ban ${deptCode}`, 403);
}

/** Loc bo cac row thuoc ngoai scope (an toan: fail-closed). */
function scopeFilter(user, rows, deptField = 'dept_code') {
  if (!Array.isArray(rows)) return rows;
  const s = resolveScope(user);
  if (s.allDepts) return rows;
  return rows.filter((r) => {
    const d = r && r[deptField];
    if (!d) return true; // row khong gan phong ban -> giu (khong phai du lieu phong ban)
    return s.depts.includes(String(d));
  });
}

// Bang -> cot dept_code dung de kiem tra scope khi load 1 record.
const RESOURCE_DEPT = {
  employees: 'dept_code',
  attendance: null, // join qua employees
  recruitments: 'dept_code',
  trainings: null,
  budgets: 'dept_code',
  sop_tasks: 'dept_code',
  leads: null, // owner_employee_id
  quotes: null,
  contracts: null,
  customers: null,
  orders: null,
  approvals: null,
  debts: null,
  expenses: null,
  payments: null,
  tickets: null,
  campaigns: null,
  it_incidents: null,
};

/**
 * Kiem tra quyen doc 1 resource theo ID (chong IDOR doi URL ID).
 * @param conn db adapter (module hoac tx conn)
 */
async function assertResourceScope(conn, user, table, id, { deptField } = {}) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  const field = deptField || RESOURCE_DEPT[table];
  if (!field) return true; // resource khong gan phong ban -> khong ap dung scope dept

  const row = await db.get(`SELECT ${field} AS dept_code FROM ${table} WHERE id=?`, [id]);
  if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay ban ghi', 404);
  enforceDept(user, row.dept_code, `${table}#${id}`);
  return true;
}

/** Middleware: kiem tra dept tu query/body/params. */
function requireDept(param = 'dept_code') {
  return (req, res, next) => {
    try {
      const code = req.params?.[param] || req.query?.[param] || req.body?.[param];
      if (code) enforceDept(req.user, code, param);
      return next();
    } catch (e) { return next(e); }
  };
}

module.exports = {
  resolveScope,
  canAccessDept,
  enforceDept,
  scopeFilter,
  assertResourceScope,
  requireDept,
  RESOURCE_DEPT,
  SCOPE_DEPT_SUBTREE,
};