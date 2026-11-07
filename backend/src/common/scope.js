// scope.js — SEC-01 + Phase 3 (P0-3/4/5, P2-19): enforce department/resource
// scope SERVER-SIDE, FAIL-CLOSED.
//
// V8.1 — tri het loi goc:
//   - RESOURCE_DEPT truoc day map phan lon bang nghiep vu ve `null` =>
//     `assertResourceScope` BO QUA check => IDOR (doi URL id don cua phong ban
//     khac van doc/ghi duoc). P0-4.
//   - `scopeFilter` giu row KHONG co dept ("khong phai du lieu phong ban") =>
//     fail-OPEN. P0-3.
//   - Chi `hr.js` goi `scopeFilter`; cac route khac (sales/finance/supply/
//     gov-min/overview/helpdesk/marketing) doc TOAN BO du lieu. P0-5.
//
// Co che moi (Phase 3):
//   1. resolveScope(user)  -> { role, dept, userDept, allDepts, depts, denied }
//      - owner/ceo          -> allDepts = true
//      - declared === 'multi' -> dept cua user + cay con (SCOPE_DEPT_SUBTREE)
//        neu user.dept_code == null => DENIED = true (fail-closed)
//   2. enforceDept(user, deptCode)      -> 403 neu ngoai scope
//   3. scopeFilter(user, rows, deptField) -> fail-closed (row khong dept => lo)
//   4. assertResourceScope(conn, user, table, id) -> dung cot that neu co,
//      nguoc lai FAIL-CLOSED (khong con im lang bo qua)
//   5. assertBusinessScope(conn, user, table, id) -> doc `resource_dept`
//   6. scopedList / scopedRows(conn, user, table, baseSql, params)
//   7. requireScoped(perm, opts) -> middleware dung chung cho MOI route
//
// Dữ liệu nguồn: bang `resource_dept` (migration 005_dept_scope) — service so
// huu ghi vao bang nay TRONG CUNG transaction voi du lieu (INV-2).
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

// Phong ban con truc tiep — dung de mo rong scope cho truong phong/giam doc khoi.
const SCOPE_DEPT_SUBTREE = {
  ceo: ['ceo', 'sales', 'marketing', 'cskh', 'ops', 'supply', 'finance', 'hr', 'it', 'legal', 'qa', 'product'],
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
};

const ALL_DEPTS = Array.from(new Set(Object.values(SCOPE_DEPT_SUBTREE).flat()));

/**
 * Tra ve scope quyen doc theo phong ban cho 1 user.
 * FAIL-CLOSED: user khong co dept_code va vai la 'multi' => denied = true.
 */
function resolveScope(user) {
  const role = user && user.role;
  const roles = loadRoles();
  const scope = (roles.role_scopes || {})[role] || {};
  const declared = scope.dept || 'multi';
  const userDept = (user && user.dept_code) || null;
  // Phase 3 (§4.6): `scope_read` = 'all' | 'dept' | 'own' | 'none'.
  //   - 'all'  : doc duoc MOI phong ban (chi ap dung cho du lieu HANH CHINH —
  //              vd nhan su; KHONG mo rong quyen tren du lieu kinh doanh).
  //   - 'dept' : phong ban cua user + cay con.
  //   - 'own'  : chi du lieu cua chinh minh.
  //   - 'none' : khong doc du lieu nghiep vu.
  const scopeRead = scope.scope_read || 'dept';

  // Vai toan cuc: doc moi noi dung (ngoai tru phan quyen tien/luong rieng).
  if (role === 'owner' || role === 'ceo') {
    return { role, dept: declared, userDept, allDepts: true, depts: ALL_DEPTS, denied: false, scopeRead };
  }
  // Vai theo khoi (director/coo/manager/leader/staff): phong ban cua user + cay con.
  if (declared === 'multi') {
    if (!userDept) {
      // FAIL-CLOSED: khong resolve duoc phong ban => khong duoc thay gi.
      return { role, dept: declared, userDept: null, allDepts: false, depts: [], denied: true, scopeRead };
    }
    const depts = [userDept, ...(SCOPE_DEPT_SUBTREE[userDept] || [])];
    return { role, dept: declared, userDept, allDepts: false, depts: Array.from(new Set(depts)), denied: false, scopeRead };
  }
  // Vai gan 1 phong ban.
  return { role, dept: declared, userDept, allDepts: false, depts: [declared], denied: false, scopeRead };
}

/**
 * Phase 3 (§4.5, hr.js): vai `scope_read='all'` (vd HR) duoc doc du lieu
 * HANH CHINH (nhan su / cham cong / tuyen dung / dao tao) cua TOAN CONG TY.
 * KHONG ap dung cho du lieu kinh doanh (don, khach, cong no...) — van scope
 * theo phong ban.
 */
function canReadAllDepts(user) {
  const s = resolveScope(user);
  return s.allDepts || s.scopeRead === 'all';
}

/**
 * Kiem tra mot phong ban co thuoc scope doc cua user khong.
 * @returns {boolean}
 */
function canAccessDept(user, deptCode) {
  const s = resolveScope(user);
  if (s.allDepts) return true;
  if (s.denied) return false;
  if (!deptCode) return false; // FAIL-CLOSED: khong ro phong ban => khong cho
  return s.depts.includes(String(deptCode));
}

/** Nem AppError 403 neu phong ban khong thuoc scope. */
function enforceDept(user, deptCode, what = 'du lieu') {
  if (!deptCode) return true;
  if (canAccessDept(user, deptCode)) return true;
  throw new AppError('FORBIDDEN', `Ban khong co quyen truy cap ${what} cua phong ban ${deptCode}`, 403);
}

/**
 * Loc bo cac row thuoc ngoai scope (FAIL-CLOSED).
 *
 * - `deptField === null` => bang khong goc voi phong ban; caller PHAI loc tay
 *   (hoac dung scopedList noi resource_dept).
 * - Row thieu `dept_code` => LO (khong giu).
 */
function scopeFilter(user, rows, deptField = 'dept_code') {
  if (!Array.isArray(rows)) return rows;
  const s = resolveScope(user);
  if (s.allDepts) return rows;
  if (deptField === null) return rows;
  if (s.denied) return [];
  return rows.filter((r) => {
    const d = r && r[deptField];
    if (d == null || d === '') return false;   // FAIL-CLOSED
    return s.depts.includes(String(d));
  });
}

// Bang -> cot dept_code that (chi cho bang co cot phong ban).
// Cac bang nghiep vu KHONG co cot dept_code -> dung `resource_dept` qua
// assertBusinessScope / scopedList (KHONG duoc bo qua).
const RESOURCE_DEPT = {
  employees: 'dept_code',
  recruitments: 'dept_code',
  budgets: 'dept_code',
  sop_tasks: 'dept_code',
  trainings: 'dept_code',
};

/**
 * Phase 3 (4.2) — quy tac suy ra dept_code khi tao ban ghi.
 * Bang -> { from: 'employee'|'customer'|'order'|null, fallback: dept_code }
 */
const DEPT_RULES = {
  orders: { from: 'employee', fallback: 'sales' },
  order_items: { from: 'order', fallback: 'sales' },
  customers: { from: 'employee', fallback: 'sales' },
  leads: { from: 'employee', fallback: 'sales' },
  quotes: { from: 'customer', fallback: 'sales' },
  contracts: { from: 'customer', fallback: 'sales' },
  shipments: { from: 'order', fallback: 'supply' },
  tickets: { from: 'customer', fallback: 'cskh' },
  debts: { from: 'order', fallback: 'finance' },
  payments: { from: 'order', fallback: 'finance' },
  stock_moves: { fallback: 'supply' },
  purchase_orders: { fallback: 'supply' },
  qa_checks: { fallback: 'qa' },
  campaigns: { fallback: 'marketing' },
  transactions: { fallback: 'finance' },
  expenses: { fallback: 'finance' },
  risks: { fallback: 'legal' },
  it_incidents: { fallback: 'it' },
  product_features: { fallback: 'product' },
  approvals: { fallback: 'ceo' },
  reminders: { fallback: 'finance' },
  reminder_log: { fallback: 'finance' },
  suppliers: { fallback: 'supply' },
  ratings: { fallback: 'cskh' },
  sop_tasks: { fallback: null },   // sop_tasks co cot dept_code that -> dung scopeFilter
  budgets: { fallback: null },     // budgets co cot dept_code that
};

/**
 * Suy ra dept_code cua 1 ban ghi theo DEPT_RULES.
 * @param conn db adapter (tx conn hoac module db)
 * @param table ten bang
 * @param opts { ownerEmployeeId, customerId, orderId }
 */
async function resolveResourceDept(conn, table, opts = {}) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  const rule = DEPT_RULES[table] || { fallback: null };
  const empDept = async (empId) => {
    if (!empId) return null;
    const e = await db.get('SELECT dept_code FROM employees WHERE id=?', [empId]);
    return e && e.dept_code ? e.dept_code : null;
  };
  if (rule.from === 'employee') {
    const d = await empDept(opts.ownerEmployeeId);
    if (d) return d;
  } else if (rule.from === 'customer') {
    if (opts.customerId) {
      const c = await db.get('SELECT owner_employee_id FROM customers WHERE id=?', [opts.customerId]);
      const d = await empDept(c && c.owner_employee_id);
      if (d) return d;
    }
  } else if (rule.from === 'order') {
    if (opts.orderId) {
      const o = await db.get('SELECT employee_id FROM orders WHERE id=?', [opts.orderId]);
      const d = await empDept(o && o.employee_id);
      if (d) return d;
    }
  }
  return rule.fallback || null;
}

/**
 * Kiem tra quyen doc 1 resource theo ID (chong IDOR doi URL ID).
 * FAIL-CLOSED: neu bang chua khai bao scope => 500 (khong im lang bo qua).
 */
async function assertResourceScope(conn, user, table, id, { deptField } = {}) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  const field = deptField || RESOURCE_DEPT[table];
  if (!field) {
    throw new AppError('FORBIDDEN', `Chua khai bao scope cho ${table} — dung assertBusinessScope`, 500);
  }
  const row = await db.get(`SELECT ${field} AS dept_code FROM ${table} WHERE id=?`, [id]);
  if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay ban ghi', 404);
  enforceDept(user, row.dept_code, `${table}#${id}`);
  return true;
}

/**
 * PHASE 3 — ban generic: doc dept tu bang `resource_dept` cho MOI bang nghiep vu.
 * Day la ham chong IDOR that su (P0-4): moi bang nghiep vu deu co 1 dong
 * trong resource_dept, ghi trong cung transaction voi du lieu.
 */
async function assertBusinessScope(conn, user, table, id) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  const rid = Number(id);
  if (!Number.isInteger(rid) || rid <= 0) throw new AppError('VALIDATION', 'ID khong hop le', 400);
  const row = await db.get(
    'SELECT dept_code FROM resource_dept WHERE table_name=? AND record_id=?',
    [table, rid]
  );
  if (!row) {
    throw new AppError('FORBIDDEN', `Khong xac dinh duoc phong ban cua ${table}#${rid}`, 403);
  }
  enforceDept(user, row.dept_code, `${table}#${rid}`);
  return true;
}

/** Ghi/overwrite dept cho resource (dung trong service so huu, TRONG tx). */
async function setBusinessScope(conn, table, id, deptCode, ownerEmployeeId = null) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  if (!deptCode) throw new AppError('VALIDATION', 'dept_code bat buoc khi gan phong ban', 400);
  await db.run(
    `INSERT INTO resource_dept(table_name, record_id, dept_code, owner_employee_id)
     VALUES(?,?,?,?)
     ON CONFLICT(table_name, record_id) DO UPDATE SET
       dept_code=excluded.dept_code,
       owner_employee_id=excluded.owner_employee_id,
       updated_at=CURRENT_TIMESTAMP`,
    [table, Number(id), deptCode, ownerEmployeeId == null ? null : Number(ownerEmployeeId)]
  );
  return true;
}

/** Suy ra dept_code theo quy tac 4.2 cua prompt. */
async function inferDept(conn, { table, ownerEmployeeId = null, fallback = null, orderId = null, customerId = null }) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  if (ownerEmployeeId) {
    const emp = await db.get('SELECT dept_code FROM employees WHERE id=?', [ownerEmployeeId]);
    if (emp && emp.dept_code) return emp.dept_code;
  }
  if (orderId) {
    const o = await db.get('SELECT employee_id FROM orders WHERE id=?', [orderId]);
    if (o && o.employee_id) {
      const emp = await db.get('SELECT dept_code FROM employees WHERE id=?', [o.employee_id]);
      if (emp && emp.dept_code) return emp.dept_code;
    }
  }
  if (customerId) {
    const c = await db.get('SELECT owner_employee_id FROM customers WHERE id=?', [customerId]);
    if (c && c.owner_employee_id) {
      const emp = await db.get('SELECT dept_code FROM employees WHERE id=?', [c.owner_employee_id]);
      if (emp && emp.dept_code) return emp.dept_code;
    }
  }
  return fallback;
}

/**
 * List co loc scope theo `resource_dept`.
 *
 * baseSql phai co dang: `SELECT ... FROM <table> [AS] <alias> [WHERE ...] [ORDER BY ...]`
 * Ham tu:
 *   - JOIN resource_dept d ON d.table_name='<table>' AND d.record_id=<alias>.id
 *   - them dieu kien `d.dept_code IN (...)` vao WHERE (dau tien trong WHERE)
 *   - them tham so dept TRUOC cac tham so goc (vi thu tu placeholder)
 */
async function scopedList(conn, user, table, baseSql, params = []) {
  const db = conn && typeof conn.get === 'function' ? conn : require('./db');
  const s = resolveScope(user);
  if (s.allDepts) return db.all(baseSql, params);
  if (s.denied || !s.depts.length) return [];
  const ph = s.depts.map(() => '?').join(',');

  // Tim bang + alias.
  const fromRe = new RegExp(`\\bFROM\\s+${table}\\b(?:\\s+(?:AS\\s+)?(\\w+))?`, 'i');
  const fm = fromRe.exec(baseSql);
  const alias = (fm && fm[1] && !/^(where|order|group|limit|join|left|inner|on|and|or)$/i.test(fm[1])) ? fm[1] : table;

  let sql = baseSql;
  // 1. JOIN resource_dept (neu chua co).
  if (!/\bJOIN\s+resource_dept\s+d\b/i.test(sql)) {
    sql = sql.replace(
      fromRe,
      (m) => `${m} JOIN resource_dept d ON d.table_name='${table}' AND d.record_id=${alias}.id`
    );
  }
  // 2. Them dieu kien dept vao WHERE (dau tien).
  const cond = `d.dept_code IN (${ph})`;
  if (/\bWHERE\b/i.test(sql)) {
    sql = sql.replace(/\bWHERE\b/i, (m) => `${m} ${cond} AND`);
  } else {
    // Khong co WHERE -> chen truoc ORDER BY / GROUP BY / LIMIT / het chuoi.
    const m = /\b(ORDER\s+BY|GROUP\s+BY|LIMIT)\b/i.exec(sql);
    if (m) sql = sql.slice(0, m.index) + `WHERE ${cond} ` + sql.slice(m.index);
    else sql = sql + ` WHERE ${cond}`;
  }
  // 3. Tham so: dept truoc, tham so goc sau.
  return db.all(sql, [...s.depts, ...params]);
}

/**
 * PHASE 3 — middleware dung chung cho MOI route (P0-3).
 *   requireScoped('orders.read')              -> quyen + scope chung
 *   requireScoped('orders.read', { deptParam: 'dept_code' })
 *   requireScoped('orders.write', { selfOnly: true })
 */
function requireScoped(perm, opts = {}) {
  return (req, res, next) => {
    try {
      const { requirePerm } = require('./auth');
      requirePerm(perm)(req, res, (err) => {
        if (err) return next(err);
        try {
          if (opts.deptParam) {
            const code = req.params?.[opts.deptParam] || req.query?.[opts.deptParam] || req.body?.[opts.deptParam];
            if (code) enforceDept(req.user, code, opts.deptParam);
          }
          if (opts.selfOnly) {
            const target = Number(req.params?.id);
            const me = Number(req.user?.id);
            if (Number.isInteger(target) && Number.isInteger(me) && target !== me) {
              throw new AppError('FORBIDDEN', 'Chi duoc thao tac tren du lieu cua chinh minh', 403);
            }
          }
          if (opts.allowNoDept !== true) {
            const s = resolveScope(req.user);
            if (s.denied && !s.allDepts) {
              throw new AppError('FORBIDDEN', 'Tai khoan chua gan phong ban — khong duoc truy cap du lieu nghiep vu', 403);
            }
          }
          return next();
        } catch (e2) { return next(e2); }
      });
    } catch (e) { return next(e); }
  };
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
  canReadAllDepts,
  enforceDept,
  scopeFilter,
  assertResourceScope,
  assertBusinessScope,
  setBusinessScope,
  resolveResourceDept,
  inferDept,
  scopedList,
  requireScoped,
  requireDept,
  RESOURCE_DEPT,
  DEPT_RULES,
  SCOPE_DEPT_SUBTREE,
  ALL_DEPTS,
};
