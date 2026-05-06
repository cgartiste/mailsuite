/**
 * MailSuite — TOTP/OTP Helper
 * Uses otpauth library for TOTP generation.
 */
const OTPAuth = require('otpauth');

function generateOtp(secret) {
  try {
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret.trim().toUpperCase().replace(/\s/g, '')), period: 30 });
    const code = totp.generate();
    const remaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    return { code, remaining };
  } catch { return { code: null, remaining: null }; }
}

function validateTotpSecret(secret) {
  try {
    new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret.trim().toUpperCase().replace(/\s/g, '')) }).generate();
    return true;
  } catch { return false; }
}

function parseBulkappCsv(content) {
  const accounts = [];
  const lines = content.trim().split('\n');
  if (!lines.length) return accounts;
  const first = lines[0].trim();
  if (first.includes(',') && (first.split(':').length - 1) < 2) {
    // CSV format
    const headers = first.split(',').map(h => h.trim().toLowerCase());
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim());
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      accounts.push({
        email: row.email || '', password: row.password || '',
        totpSecret: row.secret || row['2fa_secret'] || row.totp_secret || '',
        appPassword: row.app_password || '',
      });
    }
  } else {
    // Colon-separated: email:password:secret:app_password
    for (const line of lines) {
      const l = line.trim();
      if (!l || l.startsWith('#')) continue;
      const parts = l.split(':');
      accounts.push({
        email: (parts[0] || '').trim(), password: (parts[1] || '').trim(),
        totpSecret: (parts[2] || '').trim(), appPassword: (parts[3] || '').trim(),
      });
    }
  }
  return accounts.filter(a => a.email && a.email.includes('@'));
}

module.exports = { generateOtp, validateTotpSecret, parseBulkappCsv };
