const express = require('express');
const {
  login, refresh, logout, logoutAll, authenticate, userPermissions,
  listSessions, revokeSession,
} = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { loginLimiter, loginUserLimiter, refreshLimiter, newCsrfToken } = require('../common/security');

const router = express.Router();

// SEC-04 / AUTH-COOKIE-001: cookie phai dung chuan production.
//   - httpOnly: JS khoc doc duoc token -> chong XSS exfil.
//   - secure: chi gui qua HTTPS (production).
//   - sameSite: 'lax' cho SPA cung-site; 'strict' neu COOKIE_SAMESITE=strict.
// Cookie xoa (clearCookie) PHAI dung DUNG cac thuoc tinh giong luc set
// (neu khong, trinh duyet khong xoa duoc cookie).
function cookieOptions(maxAgeMs) {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: sameSite === 'strict' ? 'strict' : sameSite === 'none' ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

// Phase 2 (P1-16): CSRF token cookie — KHONG httpOnly (FE can doc de gui
// header X-CSRF-Token). Gia tri random 32 bytes.
function csrfCookieOptions(maxAgeMs) {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  return {
    httpOnly: false,
    secure: isProd,
    sameSite: sameSite === 'strict' ? 'strict' : sameSite === 'none' ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

const ACCESS_MAX_AGE = 30 * 60 * 1000;   // Phase 2 (P1-13): access 30p
const REFRESH_MAX_AGE = 7 * 86400000;
const CSRF_MAX_AGE = REFRESH_MAX_AGE;

function issueCsrf(res) {
  const token = newCsrfToken();
  res.cookie('csrf_token', token, csrfCookieOptions(CSRF_MAX_AGE));
  return token;
}

router.post('/login', loginLimiter, loginUserLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const out = await login(username, password, req);
    // httpOnly cookie cho ca access + refresh — SPA dung credentials:include, khong can Bearer
    res.cookie('access_token', out.token, cookieOptions(ACCESS_MAX_AGE));
    res.cookie('refresh_token', out.refresh, cookieOptions(REFRESH_MAX_AGE));
    const csrf = issueCsrf(res);
    return ok(res, { ...out, csrf_token: csrf });
  } catch (e) { return fail(res, e); }
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const t = (req.body && req.body.refresh) || req.cookies?.refresh_token;
    const out = await refresh(t, req);
    res.cookie('access_token', out.token, cookieOptions(ACCESS_MAX_AGE));
    res.cookie('refresh_token', out.refresh, cookieOptions(REFRESH_MAX_AGE));
    const csrf = issueCsrf(res);
    return ok(res, { ...out, csrf_token: csrf });
  } catch (e) { return fail(res, e); }
});

router.post('/logout', async (req, res) => {
  try {
    const t = (req.body && req.body.refresh) || req.cookies?.refresh_token;
    // clearCookie PHAI dung cung options (path/sameSite/secure) neu set.
    const opts = cookieOptions(0);
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    res.clearCookie('csrf_token', csrfCookieOptions(0));
    return ok(res, await logout(t));
  } catch (e) { return fail(res, e); }
});

// Phase 2 (P1-12): thu hoi TOAN BO phien (dung khi nghi bi can doi mat khau).
router.post('/logout-all', authenticate, async (req, res) => {
  try {
    const out = await logoutAll(req.user.id);
    const opts = cookieOptions(0);
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    res.clearCookie('csrf_token', csrfCookieOptions(0));
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});

// GET /api/auth/me — tra kem `dept_code` + `scope.depts` (Phase 3, 4.1) de FE
// hien thi pham vi du lieu va debug.
router.get('/me', authenticate, async (req, res) => {
  try {
    const { resolveScope } = require('../common/scope');
    const s = resolveScope(req.user);
    return ok(res, {
      user: req.user,
      permissions: userPermissions(req.user.role),
      dept_code: req.user.dept_code || null,
      scope: {
        role: s.role,
        dept: s.dept,
        user_dept: s.userDept,
        all_depts: s.allDepts,
        depts: s.allDepts ? 'ALL' : s.depts,
        denied: s.denied,
      },
    });
  } catch (e) { return fail(res, e); }
});

// Phase 2 (P1-12): quan ly phien — CHI phien cua chinh user goi (INV-9).
router.get('/sessions', authenticate, async (req, res) => {
  try { return ok(res, await listSessions(req.user.id)); }
  catch (e) { return fail(res, e); }
});
router.delete('/sessions/:id', authenticate, async (req, res) => {
  try { return ok(res, await revokeSession(req.user.id, req.params.id)); }
  catch (e) { return fail(res, e); }
});

module.exports = router;
