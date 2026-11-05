const express = require('express');
const { login, refresh, logout, authenticate, userPermissions } = require('../common/auth');
const { ok, fail } = require('../common/errors');
const { loginLimiter } = require('../common/security');

const router = express.Router();

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const out = await login(username, password);
    // httpOnly cookie cho ca access (8h) + refresh (7 ngay) — SPA dung credentials:include, khong can Bearer
    res.cookie('access_token', out.token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600000 });
    res.cookie('refresh_token', out.refresh, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/refresh', async (req, res) => {
  try {
    const t = (req.body && req.body.refresh) || req.cookies?.refresh_token;
    const out = await refresh(t);
    res.cookie('access_token', out.token, { httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600000 });
    res.cookie('refresh_token', out.refresh, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });
    return ok(res, out);
  } catch (e) { return fail(res, e); }
});
router.post('/logout', async (req, res) => {
  try {
    const t = (req.body && req.body.refresh) || req.cookies?.refresh_token;
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return ok(res, await logout(t));
  } catch (e) { return fail(res, e); }
});
router.get('/me', authenticate, async (req, res) => ok(res, { user: req.user, permissions: userPermissions(req.user.role) }));

module.exports = router;
