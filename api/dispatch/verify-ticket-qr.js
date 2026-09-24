const {
  ok, fail, assertLegacyApiEnabled, requireAuth, loadUserDataArr, saveUserDataArr, mapTrip,
} = require('../_lib');

// POST /api/dispatch/verify-ticket-qr
module.exports = async function handler(req, res) {
  if (!assertLegacyApiEnabled(res)) return;
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;
    if (method !== 'POST') return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

    const body = req.body || {};
    const tripId = String(body.tripId || body.ticketId || body.qrTripId || '');
    const trips = await loadUserDataArr(auth.uid, 'trips');
    const trip = (trips || []).find((t) =>
      (tripId && String(t.id ?? t.code ?? '') === tripId) ||
      (body.orderId && String(t.orderId ?? '') === String(body.orderId))
    );
    if (!trip) return fail(res, 404, 'الرحلة غير موجودة', 'TRIP_NOT_FOUND');
    const now = new Date().toTimeString().slice(0, 5);
    trip.siteArr = trip.siteArr || now;
    trip.status = 'IN_PROGRESS';
    await saveUserDataArr(auth.uid, 'trips', trips);
    return ok(res, mapTrip(trip, auth.uid), 'Ticket verified');
  } catch (err) {
    console.error('[verify-ticket-qr]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
