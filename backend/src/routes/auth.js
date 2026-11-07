const express = require('express');
const { login, refresh, logout, authenticate, userPermissions } = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { loginLimiter } = require('../common/security');

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

const ACCESS_MAX_AGE = 8 * 3600000;
const REFRESH_MAX_AGE = 7 * 86400000;

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const out = await login(username, password);
    // httpOnly cookie cho ca access (8h) + refresh (7 ngay) — SPA dung credentials:include, khong can Bearer
    res.cookie('access_token', out.token, cookieOptions(ACCESS_MAX_AGE));
    res.cookie('refresh_token', out.refresh, cookieOptions(REFRESH_MAX_AGE));
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/refresh', async (req, res) => {
  try {
    const t = (req.body && req.body.refresh) || req.cookies?.refresh_token;
    const out = await refresh(t);
    res.cookie('access_token', out.token, cookieOptions(ACCESS_MAX_AGE));
    res.cookie('refresh_token', out.refresh, cookieOptions(REFRESH_MAX_AGE));
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/logout', async (req, res) => {
  try {
    const t = (req.body && req.body.refresh) || req.cookies?.refresh_token;
    // clearCookie PHAI dung cung options (path/sameSite/secure) neu set.
    const opts = cookieOptions(0);
    res.clearCookie('access_token', opts);
    res.clearCookie('refresh_token', opts);
    return ok(res, await logout(t));
  } catch (e) { return fail(res, e); }
});
router.get('/me', authenticate, async (req, res) => ok(res, { user: req.user, permissions: userPermissions(req.user.role) }));

module.exports = router;