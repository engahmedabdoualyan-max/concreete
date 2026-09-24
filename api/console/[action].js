/**
 * Console super-admin endpoints — credentials NEVER ship in the web bundle.
 * POST /api/console/login   { email, password }
 *   → verify credentials (env vars preferred, Firestore sha256-hash fallback)
 *   → generate + email server-side OTP; client finishes via /api/otp/verify
 * POST /api/console/protect { password }
 *   → verify protection password (lock/unlock companies, protected deletes)
 */
const crypto = require('crypto');
const { ok, fail, assertLegacyApiEnabled, fsGet, fsPatch, enc } = require('../_lib');

const EMAILJS_SERVICE = process.env.EMAILJS_SERVICE_ID || 'service_mdtxmv8';
const EMAILJS_TEMPLATE = process.env.EMAILJS_TEMPLATE_ID || 'template_ablqhm3';
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || 'UPIUNYeckrEK-z_xz';
function otpSalt() {
  const value = process.env.OTP_SALT;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error('OTP_SALT must be configured in production');
  }
  return value || 'fimto-otp-salt-v1';
}

function credsSalt() {
  const value = process.env.CONSOLE_CREDS_SALT;
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error('CONSOLE_CREDS_SALT must be configured in production');
  }
  return value || 'fimto-console-salt-v1';
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

async function getFallbackCreds() {
  try {
    const doc = await fsGet('siteConfig/consoleCreds');
    if (!doc || !doc.fields) return null;
    const val = (x) => (x && x.stringValue !== undefined ? x.stringValue : null);
    return {
      emailHash: val(doc.fields.emailHash),
      passwordHash: val(doc.fields.passwordHash),
      protectionHash: val(doc.fields.protectionHash),
    };
  } catch { return null; }
}

function hashEq(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function sendOtpEmail(to, code) {
  const body = {
    service_id: EMAILJS_SERVICE,
    template_id: EMAILJS_TEMPLATE,
    user_id: EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: to,
      to_name: 'Administrator',
      code,
      plant_name: 'Fimto Control Panel',
      subject: `🔐 كود دخول لوحة التحكم: ${code}`,
      message: `كود الدخول: ${code}\nصالح لمدة 5 دقائق.`,
    },
  };
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`EmailJS ${res.status}`);
}

module.exports = async function handler(req, res) {
  if (!assertLegacyApiEnabled(res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed', 'BAD_METHOD');
  const action = String(req.query.action || '');
  try {
    /* ── POST /api/console/login ── */
    if (action === 'login') {
      const { email, password } = req.body || {};
      const e = String(email || '').trim().toLowerCase();
      const p = String(password || '');
      if (!e || !p) return fail(res, 400, 'بيانات ناقصة', 'MISSING_CREDENTIALS');

      let valid = false;
      const envEmail = (process.env.CONSOLE_EMAIL || '').trim().toLowerCase();
      const envPass = process.env.CONSOLE_PASSWORD || '';
      if (envEmail && envPass) {
        valid = e === envEmail && p === envPass;
      } else {
        const fb = await getFallbackCreds();
        if (fb && fb.emailHash && fb.passwordHash) {
          valid = hashEq(sha256(e + credsSalt()), fb.emailHash) && hashEq(sha256(p + credsSalt()), fb.passwordHash);
        }
      }
      if (!valid) return fail(res, 401, 'بيانات الدخول غير صحيحة', 'INVALID_CREDENTIALS');

      // 2FA step: server-side OTP → emailed → verified through /api/otp/verify
      const code = String(crypto.randomInt(100000, 999999));
      await fsPatch(`siteConfig/otp_${sha256('id:' + e)}`, {
        codeHash: { stringValue: sha256(code + otpSalt()) },
        expiresAt: { integerValue: String(Date.now() + 5 * 60 * 1000) },
        attempts: { integerValue: '0' },
        lastSentAt: { stringValue: String(Date.now()) },
        updatedAt: { stringValue: new Date().toISOString() },
      });
      try { await sendOtpEmail(e, code); } catch (err) {
        console.error('[console/login] otp email failed:', err.message);
        return fail(res, 502, 'فشل إرسال كود التحقق — حاول مرة أخرى', 'EMAIL_FAILED');
      }
      return ok(res, { otpRequired: true, identifier: e }, 'تم التحقق — اكتب الكود المرسل');
    }

    /* ── POST /api/console/protect ── */
    if (action === 'protect') {
      const { password } = req.body || {};
      const p = String(password || '');
      if (!p) return fail(res, 400, 'كلمة الحماية مطلوبة', 'MISSING');

      let valid = false;
      const envPass = process.env.CONSOLE_PROTECTION_PASSWORD || '';
      if (envPass) {
        valid = p === envPass;
      } else {
        const fb = await getFallbackCreds();
        if (fb && fb.protectionHash) valid = hashEq(sha256(p + credsSalt()), fb.protectionHash);
      }
      if (!valid) return fail(res, 401, 'كلمة الحماية غير صحيحة', 'INVALID_PROTECTION');
      return ok(res, { verified: true }, 'تم التحقق');
    }

    return fail(res, 404, 'Not found', 'NOT_FOUND');
  } catch (err) {
    console.error(`[console/${action}]`, err);
    return fail(res, 500, 'خطأ في الخادم', 'INTERNAL');
  }
};
