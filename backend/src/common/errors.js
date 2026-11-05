class AppError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
const CODES = {
  VALIDATION: 400, AUTH: 401, FORBIDDEN: 403, APPROVAL_REQUIRED: 403,
  NOT_FOUND: 404, STOCK_SHORTAGE: 409, DUPLICATE: 409, SLA_BREACH: 422,
};
function fail(res, err) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ ok: false, error: { code: err.code, message: err.message, details: err.details || undefined } });
  }
  // cho phep proxy goi fail voi object thuong {status, code, message} (agent offline...)
  if (err && typeof err === 'object' && (err.status || err.code)) {
    return res.status(err.status || 500).json({ ok: false, error: { code: err.code || 'INTERNAL', message: err.message || 'Loi he thong' } });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ ok: false, error: { code: 'VALIDATION', message: 'File qua lon (toi da 2MB)' } });
  }
  return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: (err && err.message) || 'Loi he thong' } });
}
function errorHandler(err, req, res, next) { // eslint-disable-line
  return fail(res, err);
}
function ok(res, data) { return res.json({ ok: true, data }); }

module.exports = { AppError, CODES, fail, errorHandler, ok };
