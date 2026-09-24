/**
 * Server-side OTP endpoints (2FA codes never touch the client before email).
 * POST /api/otp/request  { identifier }        → generate + email a 6-digit code
 * POST /api/otp/verify   { identifier, code }  → verify (TTL 5m, max 5 attempts, single-use)
 *
 * Security model:
 * - Code generated SERVER-SIDE; only sha256(code + salt) persisted
 *   (safe even while Firestore rules are open — hashes are useless offline).
 * - Rate limits: 45s resend cooldown, max 3 sends / 10 min per identifier.
 */
const crypto = require('crypto');
const { ok, fail, assertLegacyApiEnabled, enc, fsGet, fsPatch, fsDelete } = require('../_lib');

const EMAILJS_SERVICE = process.env.EMAILJS_SERVICE_ID || 'service_mdtxmv8';
const EMAILJS_TEMPLATE = process.env.EMAILJS_TEMPLATE_ID || 'template_ablqhm3';
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || 'UPIUNYeckrEK-z_xz';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || '';

const SALT = process.env.OTP_SALT || 'fimto-otp-salt-v1';
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SEND_COOLDOWN_MS = 45 * 1000;
const MAX_SENDS_WINDOW_MS = 10 * 60 * 1000;
const MAX_SENDS = 3;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const normId = (id) => String(id || '').trim().toLowerCase();
// Stored under siteConfig/* because Firestore rules currently only whitelist
// users, userData, companyTrees, siteConfig and media. Only HASHES are stored,
// so open-read on siteConfig leaks nothing useful.
// Stored under siteConfig/* because Firestore rules currently only whitelist
// users, userData, companyTrees, siteConfig and media. Only HASHES are stored,
// so open-read on siteConfig leaks nothing useful.
const docIdFor = (identifier) => `siteConfig/otp_${sha256('id:' + normId(identifier))}`;

function decodeRecord(doc) {
  if (!doc || !doc.fields) return null;
  const f = doc.fields;
  const val = (x) => (x && x.stringValue !== undefined ? x.stringValue : x && x.integerValue !== undefined ? Number(x.integerValue) : null);
  return {
    codeHash: val(f.codeHash) || '',
    expiresAt: Number(val(f.expiresAt) || 0),
    attempts: Number(val(f.attempts) || 0),
    lastSentAt: Number(val(f.lastSentAt) || 0),
    sendTimes: (() => { try { return JSON.parse(val(f.sendTimes) || '[]'); } catch { return []; } })(),
  };
}

async function sendEmail(to, code, isAdmin) {
  const body = {
    service_id: EMAILJS_SERVICE,
    template_id: EMAILJS_TEMPLATE,
    user_id: EMAILJS_PUBLIC_KEY,
    template_params: isAdmin
      ? { to_email: to, to_name: 'Administrator', code, plant_name: 'Fimto Control Panel', subject: `🔐 كود الدخول: ${code}`, message: `كود الدخول: ${code}\nصالح لمدة 5 دقائق.` }
      : { to_email: to, to_name: 'عميل Fimto', subject: `🔐 رمز التحقق: ${code}`, message: `مرحباً،\n\nرمز التحقق الخاص بك: ${code}\n\nصالح لمدة 5 دقائق فقط.\n\nإذا لم تطلبه تجاهل هذه الرسالة.\n\nفريق Fimto Soft` },
  };
  if (EMAILJS_PRIVATE_KEY) body.accessToken = EMAILJS_PRIVATE_KEY;
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`EmailJS ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

module.exports = async function handler(req, res) {
  if (!assertLegacyApiEnabled(res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed', 'BAD_METHOD');
  const action = String(req.query.action || '');
  try {
    /* ── POST /api/otp/request ── */
    if (action === 'request') {
      const { identifier, admin } = req.body || {};
      const id = normId(identifier);
      if (!id || id.length < 5) return fail(res, 400, 'أدخل بريداً إلكترونياً أو رقماً صحيحاً', 'BAD_IDENTIFIER');

      const now = Date.now();
      const prev = decodeRecord(await fsGet(docIdFor(id)));

      if (prev && prev.lastSentAt && now - prev.lastSentAt < SEND_COOLDOWN_MS) {
        const wait = Math.ceil((SEND_COOLDOWN_MS - (now - prev.lastSentAt)) / 1000);
        return fail(res, 429, `انتظر ${wait} ثانية قبل إعادة الإرسال`, 'COOLDOWN');
      }
      const recentSends = (prev?.sendTimes || []).filter((t) => now - t < MAX_SENDS_WINDOW_MS);
      if (recentSends.length >= MAX_SENDS) {
        return fail(res, 429, 'تم تجاوز حد الإرسال — حاول بعد 10 دقائق', 'RATE_LIMITED');
      }

      const code = String(crypto.randomInt(100000, 999999));
      await fsPatch(docIdFor(id), {
        codeHash: { stringValue: sha256(code + SALT) },
        expiresAt: { integerValue: String(now + CODE_TTL_MS) },
        attempts: { integerValue: '0' },
        lastSentAt: { stringValue: String(now) },
        sendTimes: { stringValue: JSON.stringify([...recentSends, now].slice(-MAX_SENDS)) },
        updatedAt: { stringValue: new Date().toISOString() },
      });

      try {
        await sendEmail(id, code, Boolean(admin));
      } catch (e) {
        console.error('[otp/request] email failed:', e.message);
        return fail(res, 502, 'تعذر إرسال البريد حالياً — أعد المحاولة بعد قليل', 'EMAIL_FAILED');
      }
      return ok(res, { sent: true, ttlMinutes: 5 }, 'تم إرسال رمز التحقق');
    }

    /* ── POST /api/otp/verify ── */
    if (action === 'verify') {
      const { identifier, code } = req.body || {};
      const id = normId(identifier);
      const c = String(code || '').trim();
      if (!id || !/^\d{6}$/.test(c)) return fail(res, 400, 'رمز غير صالح', 'BAD_CODE');

      const rec = decodeRecord(await fsGet(docIdFor(id)));
      if (!rec || !rec.codeHash) return fail(res, 404, 'اطلب رمزاً أولاً', 'NO_OTP');
      if (Date.now() > rec.expiresAt) {
        await fsDelete(docIdFor(id)).catch(() => {});
        return fail(res, 410, 'انتهت صلاحية الرمز — اطلب رمزاً جديداً', 'OTP_EXPIRED');
      }
      if (rec.attempts >= MAX_ATTEMPTS) {
        await fsDelete(docIdFor(id)).catch(() => {});
        return fail(res, 429, 'تم تجاوز عدد المحاولات — اطلب رمزاً جديداً', 'TOO_MANY_ATTEMPTS');
      }

      const given = Buffer.from(sha256(c + SALT));
      const stored = Buffer.from(rec.codeHash);
      const match = given.length === stored.length && crypto.timingSafeEqual(given, stored);

      if (!match) {
        fsPatch(docIdFor(id), { attempts: { integerValue: String(rec.attempts + 1) } }, ['attempts']).catch(() => {});
        return fail(res, 401, 'الرمز غير صحيح', 'WRONG_CODE');
      }

      await fsDelete(docIdFor(id)).catch(() => {});
      return ok(res, { verified: true }, 'تم التحقق بنجاح');
    }

    return fail(res, 404, 'Not found', 'NOT_FOUND');
  } catch (err) {
    console.error(`[otp/${action}]`, err);
    return fail(res, 500, 'خطأ في الخادم', 'INTERNAL');
  }
};
