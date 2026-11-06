const rateLimit = require('express-rate-limit');

// Public storefront limiters — chat hon apiLimiter noi bo
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const publicOrderLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const publicChatLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const publicLookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

module.exports = { publicLimiter, publicOrderLimiter, publicChatLimiter, publicLookupLimiter };
