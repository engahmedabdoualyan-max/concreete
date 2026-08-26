// uses shared zero-dep jwt from _lib
const crypto = require('crypto');
const {
  ok, fail, findUser, findUserByUid, buildAuthUser, signTokens,
  requireAuth, fsDelete, fsPatch, enc, JWT_SECRET,
} = require('../_lib');

// Same password spec as website (src/lib/passwords.ts) and mobile (lib/pw.ts)
const PW_SALT = 'fimto-pw-salt-v1';
const hashPassword = (username, password) =>
  crypto.createHash('sha256').update(`${String(username || '').trim().toLowerCase()}::${String(password || '')}::${PW_SALT}`).digest('hex');

// api/auth/[action].js → /api/auth/login|refresh|logout|delete-account
module.exports = async function handler(req, res) {
  const action = String(req.query.action || '');
  const method = req.method;

  try {
    if (action === 'login' && method === 'POST') {
      const body = req.body || {};
      const identifier = body.phone || body.username || body.email || body.identifier;
      const password = body.password;
      if (!identifier || !password) return fail(res, 400, 'بيانات الدخول ناقصة', 'MISSING_CREDENTIALS');
      const user = await findUser(identifier);
      if (!user || !user.username) return fail(res, 401, 'بيانات الدخول غير صحيحة', 'INVALID_CREDENTIALS');

      // Progressive verification: hashed first, legacy plaintext second (then upgrade)
      let valid = false;
      let needsUpgrade = false;
      const hash = hashPassword(user.username, password);
      if (user.passwordHash && user.passwordHash === hash) valid = true;
      else if (user.password && user.password === password) { valid = true; needsUpgrade = !user.passwordHash; }

      if (!valid) return fail(res, 401, 'بيانات الدخول غير صحيحة', 'INVALID_CREDENTIALS');
      if (needsUpgrade) {
        fsPatch(`users/${enc(user.username)}`, {
          passwordHash: { stringValue: hash },
          password: { stringValue: '' },
        }).catch(() => {});
      }
      const tokens = signTokens(user);
      return ok(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        user: buildAuthUser(user),
      }, 'Login successful');
    }

    if (action === 'refresh' && method === 'POST') {
      const { refreshToken } = req.body || {};
      if (!refreshToken) return fail(res, 400, 'Refresh token مفقود', 'MISSING_REFRESH_TOKEN');
      let payload;
      try { payload = jwt.verify(refreshToken, JWT_SECRET); } catch (e) { return fail(res, 401, 'انتهت الجلسة', 'INVALID_REFRESH_TOKEN'); }
      if (payload.type !== 'refresh' || !payload.uid) return fail(res, 401, 'Token غير صالح', 'INVALID_REFRESH_TOKEN');
      const user = await findUserByUid(payload.uid);
      if (!user) return fail(res, 401, 'الحساب غير موجود', 'USER_NOT_FOUND');
      const tokens = signTokens(user);
      return ok(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        user: buildAuthUser(user),
      }, 'Tokens refreshed');
    }

    if (action === 'logout' && method === 'POST') {
      return ok(res, { loggedOut: true }, 'Logged out');
    }

    if (action === 'delete-account' && method === 'POST') {
      const auth = requireAuth(req, res);
      if (!auth) return null;
      const { confirmText } = req.body || {};
      if (confirmText !== 'DELETE') return fail(res, 400, 'تأكيد الحذف مطلوب', 'CONFIRM_REQUIRED');
      await fsDelete(`users/${enc(auth.uid)}`);
      for (const col of ['trips', 'orders', 'customers', 'recipes', 'inventory', 'livePositions', 'notifications', 'deliveries', 'productionRuns', 'qcRecords', 'payments', 'purchaseOrders', 'rawStock', 'assets', 'oeeLogs', 'gpsHistory', 'plants', 'blockPlants', 'workshopConfig', 'calibrationLogs', 'returnedConcrete', 'weighbridgeRecords', 'plantProfile', 'gpsConfig']) {
        try { await fsDelete(`userData/${enc(auth.uid)}/${col}/data`); } catch (e) { /* best-effort */ }
      }
      return ok(res, { mode: 'HARD_DELETE' }, 'Account deleted');
    }

    return fail(res, 404, 'Not found', 'NOT_FOUND');
  } catch (err) {
    console.error(`[auth/${action}]`, err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
