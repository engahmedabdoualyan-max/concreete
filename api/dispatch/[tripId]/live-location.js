const {
  ok, fail, assertLegacyApiEnabled, requireAuth, loadUserDataArr, saveUserDataArr,
} = require('../../_lib');

// POST /api/dispatch/:tripId/live-location
module.exports = async function handler(req, res) {
  if (!assertLegacyApiEnabled(res)) return;
  const tripId = String(req.query.tripId || '');
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;
    if (method !== 'POST') return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

    const p = req.body || {};
    if (!tripId || p.latitude == null || p.longitude == null) return fail(res, 400, 'بيانات غير مكتملة', 'MISSING_DATA');

    const list = await loadUserDataArr(auth.uid, 'livePositions');
    list.push({
      tripId,
      vehicleId: p.vehicleId || '',
      driverId: p.driverId || auth.uid,
      lat: p.latitude,
      lng: p.longitude,
      speedKmh: p.deviceSpeedKmh != null ? p.deviceSpeedKmh : 0,
      headingDegrees: p.headingDegrees != null ? p.headingDegrees : 0,
      accuracyMetres: p.accuracyMetres != null ? p.accuracyMetres : 0,
      isMoving: Boolean(p.isMoving),
      capturedAt: p.capturedAt || new Date().toISOString(),
    });
    await saveUserDataArr(auth.uid, 'livePositions', list.slice(-500));
    return ok(res, { tripId, stored: true }, 'Location stored');
  } catch (err) {
    console.error('[live-location]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
