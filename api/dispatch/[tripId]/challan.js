const {
  ok, fail, requireAuth, loadUserDataArr, saveUserDataArr, mapTrip, mapOrder, nowHHMM,
} = require('../../_lib');

// /api/dispatch/[tripId]/challan
// GET  → challan data for the trip (or null) + trip + linked order
// POST → save/overwrite the delivery challan (received-by, signature, slump,
//        temperature, distance, QR content) captured by the driver at site.
module.exports = async function handler(req, res) {
  const tripId = String(req.query.tripId || '');
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;

    const trips = await loadUserDataArr(auth.uid, 'trips');
    const trip = (trips || []).find((t) => String(t.id ?? t.code ?? '') === tripId);
    if (!trip) return fail(res, 404, 'الرحلة غير موجودة', 'TRIP_NOT_FOUND');

    if (method === 'GET') {
      let order = null;
      if (trip.orderId) {
        const orders = await loadUserDataArr(auth.uid, 'orders');
        order = (orders || []).find(
          (o) => String(o.id ?? '') === String(trip.orderId) || String(o.orderNo ?? '') === String(trip.orderId)
        ) || null;
      }
      return ok(res, {
        trip: mapTrip(trip, auth.uid),
        order: order ? mapOrder(order) : null,
        challan: trip.challan || null,
      }, 'Challan');
    }

    if (method === 'POST') {
      const p = req.body || {};
      const receivedBy = String(p.receivedBy || '').trim();
      if (!receivedBy) return fail(res, 400, 'أدخل اسم المستلم', 'MISSING_RECEIVED_BY');

      const existing = trip.challan || {};
      const challan = {
        number: existing.number || `CH-${trip.date ? String(trip.date).replace(/-/g, '') : ''}-${tripId}`,
        receivedBy,
        customerSignature: typeof p.customerSignature === 'string' ? p.customerSignature : (existing.customerSignature || ''),
        slumpMm: p.slumpMm != null ? Number(p.slumpMm) : (existing.slumpMm != null ? existing.slumpMm : null),
        temperatureC: p.temperatureC != null ? Number(p.temperatureC) : (existing.temperatureC != null ? existing.temperatureC : null),
        distanceKm: p.distanceKm != null ? Number(p.distanceKm) : (existing.distanceKm != null ? existing.distanceKm : null),
        qrCode: existing.qrCode || `FIMTO|CHALLAN|${tripId}|${trip.orderId || ''}|${trip.qty || ''}|${trip.code || ''}`,
        capturedAt: existing.capturedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!trip.siteDep || trip.siteDep === '00:00') trip.siteDep = trip.siteDep || nowHHMM();
      trip.challan = challan;

      await saveUserDataArr(auth.uid, 'trips', trips);
      return ok(res, { tripId, challan }, 'Challan saved');
    }

    return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (err) {
    console.error('[challan]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
