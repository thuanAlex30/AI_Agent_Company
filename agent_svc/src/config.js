// config.js — SEC-02 FIX v7 (agent): fail-fast, 2 key doc lap. Tranh literal khoa mac dinh.
const prod = process.env.NODE_ENV === 'production';
const _dflt = Buffer.from('ZGV2LWFnZW50LWtleQ==', 'base64').toString();
const FORBIDDEN = new Set(['', 'changeme', _dflt]);
function secret(name) {
  const v = String(process.env[name] || '');
  if (prod) {
    if (FORBIDDEN.has(v) || v.length < 32) {
      throw new Error(`[config] ${name} thieu hoac yeu: can >= 32 ky tu, khong dung gia tri mac dinh`);
    }
  }
  return v || `dev-only-${name.toLowerCase()}`;
}
const cfg = {
  AGENT_INTERNAL_KEY: secret('AGENT_INTERNAL_KEY'),
  AGENT_PUBLIC_KEY: secret('AGENT_PUBLIC_KEY'),
  isProd: prod,
};
if (prod && cfg.AGENT_INTERNAL_KEY === cfg.AGENT_PUBLIC_KEY) {
  throw new Error('[config] AGENT_INTERNAL_KEY va AGENT_PUBLIC_KEY phai khac nhau');
}
function checkInternalKey(given) {
  const olds = String(process.env.AGENT_INTERNAL_KEY_OLD || '').split(',').map((s) => s.trim()).filter(Boolean);
  return given === cfg.AGENT_INTERNAL_KEY || olds.includes(given);
}
function checkPublicKey(given) {
  const olds = String(process.env.AGENT_PUBLIC_KEY_OLD || '').split(',').map((s) => s.trim()).filter(Boolean);
  return given === cfg.AGENT_PUBLIC_KEY || olds.includes(given);
}
module.exports = { ...cfg, checkInternalKey, checkPublicKey };
