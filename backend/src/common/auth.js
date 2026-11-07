const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get, run } = require('./db');
const { nowPlusMinutesISO } = require('./db');
const { AppError } = require('./errors');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || '';
if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
  throw new Error('Thieu JWT_SECRET khi NODE_ENV=production (fail-fast)');
}
const ACCESS_TTL = '8h';
const REFRESH_DAYS = 7;

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, employee_code: user.employee_code || null },
    JWT_SECRET || 'dev-secret-khong-dung-prod',
    { expiresIn: ACCESS_TTL }
  );
}
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

async function login(username, password) {
  const user = await get('SELECT * FROM users WHERE username=?', [username]);
  if (!user) throw new AppError('AUTH', 'Sai tai khoan hoac mat khau', 401);
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError('AUTH', 'Tai khoan bi khoa tam thoi, thu lai sau 15 phut', 401);
  }
  const okPwd = await bcrypt.compare(password, user.password_hash);
  if (!okPwd) {
    const failed = (user.failed_attempts || 0) + 1;
    if (failed >= 5) {
      await run('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?', [failed, nowPlusMinutesISO(15), user.id]);
    } else {
      await run('UPDATE users SET failed_attempts=? WHERE id=?', [failed, user.id]);
    }
    throw new AppError('AUTH', 'Sai tai khoan hoac mat khau', 401);
  }
  await run('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=?', [user.id]);
  const access = signAccess(user);
  const refresh = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + REFRESH_DAYS * 86400000).toISOString();
  await run('INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)', [user.id, hashToken(refresh), expires]);
  return { token: access, refresh, user: { id: user.id, username: user.username, role: user.role, employee_code: user.employee_code } };
}

/**
 * SEC-02 / AUTH-REFRESH-RACE-001: xoay vong refresh token ATOMIC + phat hien tai su dung lai.
 *
 * Race truoc day:
 *   1. doc row (revoked=false)
 *   2. UPDATE revoked=true
 *   3. INSERT token moi
 *   10 request refresh cung 1 token -> nhieu request doc duoc revoked=false
 *   truoc khi buoc 2 chay -> tat ca deu thay cong va tao 10 token moi.
 *
 * Fix:
 *   - UPDATE ... WHERE id=? AND revoked IS NOT TRUE (conditional update).
 *     Chi request nao "thang" moi co changes=1. Request khac changes=0 -> 401.
 *   - Thuc hien trong 1 transaction (tx) -> insert token moi + revoke la atomic.
 *   - REUSE DETECTION: token da bi revoke -> dau hieu bi replay (token bi
 *     attacker lay duoc). Khi do thu hoi TAT CA token cua user do
 *     (session hijack -> force re-login) va ghi log canh bao.
 */
async function refresh(refreshToken) {
  if (!refreshToken) throw new AppError('AUTH', 'Refresh token het han', 401);
  const h = hashToken(refreshToken);
  const { tx } = require('./db');

  return tx(async (c) => {
    const row = await c.get('SELECT * FROM refresh_tokens WHERE token_hash=?', [h]);
    if (!row) throw new AppError('AUTH', 'Refresh token het han', 401);

    const expired = new Date(row.expires_at) < new Date();
    const revoked = row.revoked === 1 || row.revoked === true;

    if (revoked) {
      // REUSE DETECTION: token da xoay vong lai duoc dung -> co thang bi attacker
      // lay. Thu hoi toan bo session cua user do va ghi log canh bao.
      try {
        await c.run('UPDATE refresh_tokens SET revoked=TRUE WHERE user_id=? AND revoked IS NOT TRUE', [row.user_id]);
      } catch (e) {
        logger.error('reuse-detection revoke-all fail', { msg: e.message });
      }
      logger.warn('refresh token reuse detected — thu hoi toan bo session', {
        user_id: row.user_id, token_id: row.id,
      });
      throw new AppError('AUTH', 'Refresh token het han', 401);
    }
    if (expired) throw new AppError('AUTH', 'Refresh token het han', 401);

    const user = await c.get('SELECT * FROM users WHERE id=?', [row.user_id]);
    if (!user) throw new AppError('AUTH', 'Tai khoan khong ton tai', 401);

    // Conditional update: chi request "thang" moi thay doi 1 dong.
    const upd = await c.run(
      'UPDATE refresh_tokens SET revoked=TRUE WHERE id=? AND revoked IS NOT TRUE',
      [row.id]
    );
    if (!upd || Number(upd.changes) !== 1) {
      // Request khac da xoay vong truoc -> 401 (chi 1 request duoc phep).
      throw new AppError('AUTH', 'Refresh token het han', 401);
    }

    const access = signAccess(user);
    const next = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + REFRESH_DAYS * 86400000).toISOString();
    await c.run('INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)', [user.id, hashToken(next), expires]);
    return { token: access, refresh: next };
  });
}

async function logout(refreshToken) {
  if (!refreshToken) return { revoked: false };
  await run('UPDATE refresh_tokens SET revoked=TRUE WHERE token_hash=?', [hashToken(refreshToken)]);
  return { revoked: true };
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

module.exports = { login, refresh, logout, authenticate, requirePerm, filterEmployeeRow, userPermissions, signAccess };