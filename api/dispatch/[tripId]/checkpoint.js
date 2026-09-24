const {
  ok, fail, assertLegacyApiEnabled, requireAuth, loadUserDataArr, saveUserDataArr,
  orderDerived, computeCycleMinutes, nowHHMM,
} = require('../../_lib');

// POST /api/dispatch/:tripId/checkpoint
module.exports = async function handler(req, res) {
  if (!assertLegacyApiEnabled(res)) return;
  const tripId = String(req.query.tripId || '');
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;
    if (method !== 'POST') return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

    const { checkpoint, latitude, longitude } = req.body || {};
    if (!tripId || !checkpoint) return fail(res, 400, 'بيانات غير مكتملة', 'MISSING_DATA');

    const trips = await loadUserDataArr(auth.uid, 'trips');
    const trip = (trips || []).find((t) => String(t.id ?? t.code ?? '') === tripId);
    if (!trip) return fail(res, 404, 'الرحلة غير موجودة', 'TRIP_NOT_FOUND');

    const cp = String(checkpoint).toUpperCase();
    const now = nowHHMM();
    // Order of progression; we only ever advance forward (idempotent for replays).
    const SEQ = ['ARR_PLANT', 'ARR_BSTC', 'DEP_PLANT', 'ARR_SITE', 'POUR_START', 'DEP_SITE', 'RETURN_PLANT'];
    const current = String(trip.currentCheckpoint || 'ARR_PLANT').toUpperCase();
    const idx = SEQ.indexOf(cp);
    const curIdx = SEQ.indexOf(current);
    if (idx >= 0 && (curIdx < 0 || idx >= curIdx)) {
      trip.currentCheckpoint = cp;
      const cps = {
        ARR_PLANT: () => { trip.stationArr = trip.stationArr || now; trip.status = 'IN_PROGRESS'; },
        ARR_BSTC: () => { trip.stationArr = trip.stationArr || now; trip.status = 'IN_PROGRESS'; },
        DEP_PLANT: () => { trip.stationDep = trip.stationDep || now; trip.status = 'IN_PROGRESS'; },
        ARR_SITE: () => { trip.siteArr = trip.siteArr || now; trip.status = 'IN_PROGRESS'; },
        POUR_START: () => { trip.pourStartTime = trip.pourStartTime || now; trip.status = 'IN_PROGRESS'; },
        DEP_SITE: () => { trip.siteDep = trip.siteDep || now; trip.status = 'IN_PROGRESS'; },
        RETURN_PLANT: () => {
          trip.returnTime = trip.returnTime || now;
          trip.status = 'COMPLETED';
          trip.isCompleted = true;
        },
      };
      if (cps[cp]) cps[cp]();
    }
    if (latitude != null && longitude != null) trip.siteGeo = `${latitude},${longitude}`;

    // Cycle time: DEP_PLANT → RETURN_PLANT (the core RMC productivity number).
    if (cp === 'RETURN_PLANT' || String(trip.status).toUpperCase() === 'COMPLETED') {
      trip.cycleTimeMin = computeCycleMinutes(trip.stationDep, trip.returnTime);
    }

    // Over-delivery guard rail: completing this load may not push the order
    // beyond its ordered quantity (mirrors DeliveryChallan.validate_against_order).
    if (cp === 'RETURN_PLANT' && trip.orderId) {
      const orders = await loadUserDataArr(auth.uid, 'orders');
      const order = (orders || []).find(
        (o) => String(o.id ?? '') === String(trip.orderId) || String(o.orderNo ?? '') === String(trip.orderId)
      );
      if (order && order.quantity > 0) {
        const derived = orderDerived(order, trips);
        if (derived.deliveredQty > order.quantity + 0.001) {
          return fail(res, 409, `لا يمكن إتمام الرحلة: الكمية المورّدة (${derived.deliveredQty} م³) تتجاوز طلب ${order.orderNo || order.id} (${order.quantity} م³) بمقدار ${Math.round((derived.deliveredQty - order.quantity) * 100) / 100} م³`, 'OVER_DELIVERY');
        }
      }
    }

    await saveUserDataArr(auth.uid, 'trips', trips);
    return ok(res, { tripId, checkpoint: cp, cycleTimeMin: trip.cycleTimeMin || 0 }, 'Checkpoint updated');
  } catch (err) {
    console.error('[checkpoint]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
