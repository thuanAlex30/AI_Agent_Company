const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

function applySecurity(app) {
  app.set('trust proxy', 1); // trust proxy — rate-limit sau Nginx
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], objectSrc: ["'none'"] } } }));
  const whitelist = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim());
  app.use(cors({ origin: (origin, cb) => {
    if (!origin || whitelist.includes(origin)) return cb(null, true);
    return cb(null, false);
  }, credentials: true }));
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });

const chatLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

module.exports = { applySecurity, loginLimiter, apiLimiter, chatLimiter };
