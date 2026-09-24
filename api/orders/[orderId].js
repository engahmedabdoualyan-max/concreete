const {
  ok, fail, assertLegacyApiEnabled, requireAuth, loadUserDataArr, mapOrder, orderDerived,
} = require('../_lib');

// api/orders/[orderId].js → GET /api/orders/:orderId
module.exports = async function handler(req, res) {
  if (!assertLegacyApiEnabled(res)) return;
  const orderId = String(req.query.orderId || '');
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;

    if (method === 'GET') {
      const orders = await loadUserDataArr(auth.uid, 'orders');
      const order = (orders || []).find((o) => String(o.id ?? '') === orderId || String(o.orderNo ?? '') === orderId);
      if (!order) return fail(res, 404, 'الطلب غير موجود', 'ORDER_NOT_FOUND');
      const trips = await loadUserDataArr(auth.uid, 'trips');
      return ok(res, { ...mapOrder(order), ...orderDerived(order, trips) }, 'Order');
    }

    return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (err) {
    console.error('[order]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
