const {
  ok, fail, requireAuth, loadUserDataArr, mapTrip,
} = require('../_lib');

// GET /api/dispatch/history
module.exports = async function handler(req, res) {
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;
    if (method !== 'GET') return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

    const trips = await loadUserDataArr(auth.uid, 'trips');
    const history = (trips || [])
      .filter((t) => {
        const s = String(t.status || '').toUpperCase();
        return s === 'COMPLETED' || /cancel/i.test(s);
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .map((t) => mapTrip(t, auth.uid));

    return ok(res, history, 'Trip history');
  } catch (err) {
    console.error('[history]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
