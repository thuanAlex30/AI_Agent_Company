const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get, run, all, tx, nowISO, toSqlDateTime, isExpired } = require('./db');
const { AppError } = require('./errors');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || '';
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
  throw new Error('Thieu JWT_SECRET khi NODE_ENV=production (fail-fast)');
}
// Phase 2 (P1-13): access token rut ngan 30p (truoc 8h) + refresh tu dong o FE.
const ACCESS_TTL = process.env.ACCESS_TTL || '30m';
const REFRESH_DAYS = Number(process.env.REFRESH_DAYS || 7);
// Phase 2 (P1-12): toi da 5 phien dong thoi cho 1 user.
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 5);

/**
 * Phase 1 (P0-1) — ID người dùng dạng SỐ.
 *
 * Cột `created_by` / `updated_by` / `requester` / `decided_by` trong migration
 * đều là BIGINT. Trước đây code truyền `req.user.username` (chuỗi) vào đó
 * => PostgreSQL trả 500 "invalid input syntax for type bigint" => TOÀN BỘ
 * luồng tạo dữ liệu (đơn ERP, đơn web, kho, công nợ, PO, báo giá, hợp đồng,
 * chi phí) chết trên production.
 *
 * Quy ước mới (bắt buộc):
 *   - `created_by` (BIGINT)  <- `actorId(req.user)`  (SỐ hoặc null)
 *   - `audit_log.actor` (TEXT) <- `req.user.username` (tên đọc dễ)
 */
function actorId(user) {
  const id = Number(user && user.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function signAccess(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
      employee_code: user.employee_code || null,
      // P1-13: jri de doi token la duy nhat + auth_version de vo hieu hoa
      // toan bo access token khi doi mat khau / doi role / khoa tai khoan.
      jti: crypto.randomUUID(),
      av: Number(user.auth_version || 1),
    },
    JWT_SECRET || 'dev-secret-khong-dung-prod',
    { expiresIn: ACCESS_TTL }
  );
}
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

/** Rút gọn User-Agent -> nhãn thiết bị đọc được (Chrome / Windows). */
function deviceLabel(ua = '') {
  const s = String(ua || '').slice(0, 200);
  const browser = /Edg\//.test(s) ? 'Edge'
    : /OPR\//.test(s) ? 'Opera'
      : /Chrome\//.test(s) ? 'Chrome'
        : /Safari\//.test(s) ? 'Safari'
          : /Firefox\//.test(s) ? 'Firefox'
            : /curl/i.test(s) ? 'curl'
              : /node/i.test(s) ? 'Node'
                : 'Unknown';
  const os = /Windows/i.test(s) ? 'Windows'
    : /Android/i.test(s) ? 'Android'
      : /iPhone|iPad|iOS/i.test(s) ? 'iOS'
        : /Mac OS/i.test(s) ? 'macOS'
          : /Linux/i.test(s) ? 'Linux'
            : 'Unknown';
  return `${browser} / ${os}`;
}

/** Lay IP thong qua proxy-trust (KHONG tin X-Forwarded-For raw). */
function requestIp(req) {
  try {
    const { clientIp } = require('./security');
    return String(clientIp(req) || '').slice(0, 64);
  } catch {
    return String((req && req.ip) || '').slice(0, 64);
  }
}

/**
 * Phase 2 (P1-12): gioi han so phien dong thoi.
 * Khi login moi va vuot MAX_SESSIONS -> thu hoi token CUOI CUNG (oldest).
 */
async function enforceSessionLimit(userId) {
  const rows = await all(
    `SELECT id FROM refresh_tokens WHERE user_id=? AND revoked IS NOT TRUE
      ORDER BY created_at ASC, id ASC`,
    [userId]
  );
  if (rows.length <= MAX_SESSIONS) return 0;
  const excess = rows.slice(0, rows.length - MAX_SESSIONS).map((r) => r.id);
  if (!excess.length) return 0;
  const placeholders = excess.map(() => '?').join(',');
  await run(
    `UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='session_limit' WHERE id IN (${placeholders})`,
    excess
  );
  return excess.length;
}

async function login(username, password, req = null) {
  const user = await get('SELECT * FROM users WHERE username=?', [username]);
  if (!user) throw new AppError('AUTH', 'Sai tai khoan hoac mat khau', 401);
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('AUTH', 'Tai khoan bi khoa tam thoi, thu lai sau 15 phut', 401);
  }
  const okPwd = await bcrypt.compare(password, user.password_hash);
  if (!okPwd) {
    const failed = (user.failed_attempts || 0) + 1;
    if (failed >= 5) {
      await run('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?', [failed, nowISO(), user.id]);
    } else {
      await run('UPDATE users SET failed_attempts=? WHERE id=?', [failed, user.id]);
    }
    throw new AppError('AUTH', 'Sai tai khoan hoac mat khau', 401);
  }
  await run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?', [user.id]);
  const access = signAccess(user);
  const refresh = crypto.randomBytes(32).toString('hex');
  const ua = req ? String(req.headers['user-agent'] || '').slice(0, 200) : null;
  await run(
    `INSERT INTO refresh_tokens(user_id,token_hash,expires_at,user_agent,ip,device_label,last_used_at)
     VALUES(?,?,?,?,?,?,?)`,
    [
      user.id, hashToken(refresh), toSqlDateTime(new Date(Date.now() + REFRESH_DAYS * 86400000)),
      ua, req ? requestIp(req) : null, ua ? deviceLabel(ua) : null, nowISO(),
    ]
  );
  await enforceSessionLimit(user.id);
  return {
    token: access,
    refresh,
    user: { id: user.id, username: user.username, role: user.role, employee_code: user.employee_code },
  };
}

/**
 * SEC-02 / AUTH-REFRESH-RACE-001 + Phase 2 (P0-2): xoay vong refresh token
 * ATOMIC + phat hien tai su dung lai (reuse) — va lan nay la ban THAT.
 *
 * BUG GOC (P0-2): nhanh "reuse detected" chay `UPDATE refresh_tokens SET
 * revoked=TRUE WHERE user_id=?` **TRONG transaction**, roi `throw` => ROLLBACK
 * => lenh thu hoi bi huy => token cu van ACTIVE => attacker giu token van dung
 * duoc. => "reuse detection" chi la hien thi, khong co tac dung bao ve.
 *
 * FIX: viet lanh thu hoi (revoke-all) **NGOAI transaction** truoc khi throw.
 * Day la hanh dong bao mat: no phai COMMIT du chung giao dich xoay vong that
 * bao loi. Comment nay de reviewer khong "sua nham" ve sau.
 *
 * Ngoai ra:
 *   - Xoay vong (rotate) van ATOMIC trong 1 tx (UPDATE co dieu kien + INSERT).
 *   - Audit ghi TRONG cung tx cua rotate (INV-2).
 */
async function refresh(refreshToken, req = null) {
  if (!refreshToken) throw new AppError('AUTH', 'Refresh token het han', 401);
  const h = hashToken(refreshToken);
  const db = require('./db');

  // --- Bước 1: đọc + kiểm tra NGOÀI tx -------------------------------------
  const row = await db.get('SELECT * FROM refresh_tokens WHERE token_hash=?', [h]);
  if (!row) throw new AppError('AUTH', 'Refresh token het han', 401);

  // Phase 0.6: so sanh chuoi theo cung dinh dang (ISO-lexicographic).
  const expired = isExpired(row.expires_at, nowISO());
  const revoked = row.revoked === 1 || row.revoked === true;

  if (revoked) {
    // REUSE DETECTED -> thu hoi TOAN BO session cua user.
    // GHI NGOAI TX (khong rollback) — bat buoc, xem comment o tren.
    await db.run(
      "UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='reuse' WHERE user_id=? AND revoked IS NOT TRUE",
      [row.user_id]
    );
    logger.warn('refresh token reuse detected — thu hoi toan bo session', {
      user_id: row.user_id, token_id: row.id,
    });
    await db.run(
      "INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)",
      [String(row.user_id), 'security.refresh_reuse', 'refresh_tokens', row.id, null, JSON.stringify({ revoked_all: true })]
    );
    throw new AppError('AUTH', 'Refresh token het han', 401);
  }
  if (expired) {
    await db.run(
      "UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='expired' WHERE id=?",
      [row.id]
    );
    throw new AppError('AUTH', 'Refresh token het han', 401);
  }

  // --- Bước 2: binding UA/IP (mềm) ----------------------------------------
  const ua = req ? String(req.headers['user-agent'] || '').slice(0, 200) : null;
  const ip = req ? requestIp(req) : null;
  if (row.user_agent && ua && row.user_agent !== ua) {
    // Khac hoan toan user-agent => coi nhu reuse (thiet bi khac).
    await db.run(
      "UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='reuse' WHERE user_id=? AND revoked IS NOT TRUE",
      [row.user_id]
    );
    await db.run(
      "INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)",
      [String(row.user_id), 'security.refresh_ua_mismatch', 'refresh_tokens', row.id, null,
        JSON.stringify({ expected: row.user_agent, actual: ua })]
    );
    logger.warn('refresh token user-agent mismatch — thu hoi toan bo session', { user_id: row.user_id });
    throw new AppError('AUTH', 'Refresh token het han', 401);
  }
  if (row.ip && ip && row.ip !== ip) {
    // IP khac (NAT doi IP la binh thuong) -> CHI ghi canh bao, KHONG chan.
    await db.run(
      "INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)",
      [String(row.user_id), 'security.refresh_ip_mismatch', 'refresh_tokens', row.id, null,
        JSON.stringify({ expected: row.ip, actual: ip })]
    );
    logger.warn('refresh token ip mismatch (khong chan)', { user_id: row.user_id });
  }

  // --- Bước 3: xoay vong ATOMIC trong 1 tx ---------------------------------
  const out = await db.tx(async (c) => {
    // Conditional update: chi request "thang" moi thay doi 1 dong.
    const upd = await c.run(
      'UPDATE refresh_tokens SET revoked=TRUE, revoked_reason=\'rotated\' WHERE id=? AND revoked IS NOT TRUE',
      [row.id]
    );
    if (!upd || Number(upd.changes) !== 1) {
      // Request khac da xoay vong truoc -> 401 (chi 1 request duoc phep).
      throw new AppError('AUTH', 'Refresh token het han', 401);
    }
    const user = await c.get('SELECT * FROM users WHERE id=?', [row.user_id]);
    if (!user) throw new AppError('AUTH', 'Tai khoan khong ton tai', 401);
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new AppError('AUTH', 'Tai khoan bi khoa tam thoi', 401);
    }
    const access = signAccess(user);
    const next = crypto.randomBytes(32).toString('hex');
    const r = await c.run(
      `INSERT INTO refresh_tokens(user_id,token_hash,expires_at,user_agent,ip,device_label,rotated_from_id,last_used_at)
       VALUES(?,?,?,?,?,?,?,?)`,
      [
        user.id, hashToken(next), toSqlDateTime(new Date(Date.now() + REFRESH_DAYS * 86400000)),
        ua || row.user_agent, ip || row.ip, row.device_label, row.id, nowISO(),
      ]
    );
    const newId = r.lastInsertRowid || row.id;
    // INV-2: audit TRONG cung transaction voi du lieu.
    await c.run(
      'INSERT INTO audit_log(actor,action,table_name,record_id,old_json,new_json) VALUES(?,?,?,?,?,?)',
      [String(user.username), 'security.refresh_rotate', 'refresh_tokens', newId, null, null]
    );
    return { token: access, refresh: next, user_id: user.id };
  });

  await enforceSessionLimit(out.user_id);
  return { token: out.token, refresh: out.refresh };
}

/** Thu hoi 1 phien (token hien tai). */
async function logout(refreshToken) {
  if (!refreshToken) return { revoked: false };
  await run(
    "UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='logout' WHERE token_hash=?",
    [hashToken(refreshToken)]
  );
  return { revoked: true };
}

/** Thu hoi TOAN BO phien cua user. */
async function logoutAll(userId) {
  const r = await run(
    "UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='logout_all' WHERE user_id=? AND revoked IS NOT TRUE",
    [userId]
  );
  return { revoked: true, changes: Number(r?.changes || 0) };
}

/** Danh sach phien dang active — CHI phien cua chinh user goi (P0-2 / INV-9). */
async function listSessions(userId) {
  const rows = await all(
    `SELECT id, device_label, ip, user_agent, created_at, last_used_at, expires_at
       FROM refresh_tokens
      WHERE user_id=? AND revoked IS NOT TRUE AND expires_at > ?
      ORDER BY created_at DESC, id DESC`,
    [userId, nowISO()]
  );
  return rows;
}

/** Thu hoi 1 phien theo id — phai thuoc user goi (khong IDOR). */
async function revokeSession(userId, sessionId) {
  const id = Number(sessionId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('VALIDATION', 'Session id khong hop le', 400);
  const row = await get('SELECT id FROM refresh_tokens WHERE id=? AND user_id=?', [id, userId]);
  if (!row) throw new AppError('NOT_FOUND', 'Khong tim thay phien', 404);
  await run(
    "UPDATE refresh_tokens SET revoked=TRUE, revoked_reason='revoked_by_user' WHERE id=? AND user_id=?",
    [id, userId]
  );
  return { revoked: true, id };
}

/** Tang auth_version -> vohieu hoa toan bo access token dang hieu luc. */
async function bumpAuthVersion(userId) {
  await run('UPDATE users SET auth_version = COALESCE(auth_version,1) + 1 WHERE id=?', [userId]);
  return true;
}

async function authenticate(req, res, next) {  // dev-only: x-user-code (cam o prod)
  if (req.headers['x-user-code'] && process.env.NODE_ENV !== 'production') {
    logger.warn('x-user-code dev-only', { code: req.headers['x-user-code'] });
    req.userDev = String(req.headers['x-user-code']);
  }
  if (req.headers['x-user-code'] && process.env.NODE_ENV === 'production') {
    return next(new AppError('FORBIDDEN', 'x-user-code bi cam o production', 403));
  }
  // SPA dung httpOnly cookie (credentials:include) — uu tien Bearer, fallback cookie
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer (.+)$/);
  const token = (m && m[1]) || (req.cookies && req.cookies.access_token) || '';
  if (!token) return next(new AppError('AUTH', 'Thieu token', 401));
  try {
    const p = jwt.verify(token, JWT_SECRET || 'dev-secret-khong-dung-prod');
    req.user = { id: p.sub, username: p.username, role: p.role, employee_code: p.employee_code };
    // SEC-01: kem phong ban cua nhan vien vao req.user de enforce scope
    // theo phong ban (khong chi theo role matrix).
    if (req.user.employee_code) {
      try {
        const db = require('./db');
        const emp = await db.get('SELECT dept_code FROM employees WHERE code=?', [req.user.employee_code]);
        if (emp) req.user.dept_code = emp.dept_code;
      } catch (e) {
        logger.warn('resolve dept_code that bai', { employee_code: req.user.employee_code, msg: e.message });
      }
    }
    // Phase 2 (P1-13): auth_version — neu user doi mat khau / doi role /
    // khoa tai khoan thi auth_version tang => access token cu phai 401 NGAY.
    try {
      const db = require('./db');
      const u = await db.get('SELECT auth_version, locked_until FROM users WHERE id=?', [p.sub]);
      if (!u) return next(new AppError('AUTH', 'Tai khoan khong ton tai', 401));
      if (u.locked_until && new Date(u.locked_until) > new Date()) {
        return next(new AppError('AUTH', 'Tai khoan bi khoa tam thoi', 401));
      }
      const curAv = Number(u.auth_version || 1);
      if (p.av !== undefined && Number(p.av) !== curAv) {
        logger.warn('access token bi vohieu hoa (auth_version thay doi)', { user_id: p.sub });
        return next(new AppError('AUTH', 'Token het han hoac khong hop le', 401));
      }
    } catch (e) {
      if (e instanceof AppError) return next(e);
      logger.warn('auth_version check fail', { msg: e.message });
    }
    return next();
  } catch {
    return next(new AppError('AUTH', 'Token het han hoac khong hop le', 401));
  }
}

let rolesCache = null;
function loadRoles() {
  if (!rolesCache) {
    rolesCache = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs/contract/roles-permissions.json'), 'utf8'));
  }
  return rolesCache;
}
function requirePerm(perm) {
  return (req, res, next) => {
    const role = req.user && req.user.role;
    if (!role) return next(new AppError('AUTH', 'Chua dang nhap', 401));
    const matrix = loadRoles().matrix || {};
    const allowed = matrix[perm] || [];
    if (allowed.includes('*') || allowed.includes(role)) return next();
    return next(new AppError('FORBIDDEN', `Vai ${role} khong co quyen ${perm}`, 403));
  };
}
function filterEmployeeRow(row, role) {
  const allow = (loadRoles().field_filter || {})['employees.salary_base'];
  if (allow && allow.allow.includes(role)) return row;
  if (!row) return row;
  const copy = { ...row };
  delete copy.salary_base;
  return copy;
}
function userPermissions(role) {
  const matrix = loadRoles().matrix || {};
  return Object.keys(matrix).filter((p) => matrix[p].includes('*') || matrix[p].includes(role));
}

module.exports = {
  login, refresh, logout, logoutAll, authenticate, requirePerm, filterEmployeeRow,
  userPermissions, signAccess, actorId, deviceLabel, listSessions, revokeSession,
  bumpAuthVersion, ACCESS_TTL, REFRESH_DAYS, MAX_SESSIONS,
};
