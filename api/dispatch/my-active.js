const {
  ok, fail, assertLegacyApiEnabled, requireAuth, loadUserDataArr, mapTrip,
} = require('../_lib');

// GET /api/dispatch/my-active
module.exports = async function handler(req, res) {
  if (!assertLegacyApiEnabled(res)) return;
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;
    if (method !== 'GET') return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

    const trips = await loadUserDataArr(auth.uid, 'trips');
    const active = (trips || []).find((t) => {
      const s = String(t.status || '').toUpperCase();
      return s !== 'COMPLETED' && !/cancel/i.test(s);
    });
    if (!active) return ok(res, null, 'No active trip');
    return ok(res, mapTrip(active, auth.uid), 'Active trip');
  } catch (err) {
    console.error('[my-active]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
