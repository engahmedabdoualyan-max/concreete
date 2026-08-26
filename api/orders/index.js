const {
  ok, fail, requireAuth, loadUserDataArr, saveUserDataArr, mapOrder, orderDerived,
} = require('../_lib');
// api/orders/index.js → GET/POST /api/orders
module.exports = async function handler(req, res) {
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;

    if (method === 'GET') {
      const orders = await loadUserDataArr(auth.uid, 'orders');
      const trips = await loadUserDataArr(auth.uid, 'trips');
      return ok(res, {
        orders: (orders || []).map((o) => ({ ...mapOrder(o), ...orderDerived(o, trips) })),
      }, 'Orders list');
    }

    if (method === 'POST') {
      const p = req.body || {};
      const orders = await loadUserDataArr(auth.uid, 'orders');
      const id = `O-${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`;

      let companyName = p.companyName || '';
      let companyCode = p.clientCode || '';
      let customer = null;
      if (!companyName || !companyCode || p.clientId) {
        const customers = await loadUserDataArr(auth.uid, 'customers');
        customer = (customers || []).find(
          (c) => String(c.id ?? '') === String(p.clientId ?? '') || String(c.code ?? '') === String(p.clientId ?? '')
        );
        if (customer) {
          companyName = companyName || String(customer.name || '');
          companyCode = companyCode || String(customer.code || customer.id || '');
        }
      }

      // Credit hold guard rail: a customer on hold cannot get a new order.
      if (customer && (customer.creditHold || customer.hold || customer.debtStatus === 'blocked')) {
        return fail(res, 409, `العميل ${customer.name || customer.code || ''} مجمّد — لا يمكن إنشاء طلب جديد له`, 'CREDIT_HOLD');
      }

      const order = {
        id,
        orderNo: p.orderNo || `ORD-${Date.now().toString().slice(-6)}`,
        customerId: p.clientId || '',
        customerName: companyName || '',
        customerCode: companyCode || '',
        projectName: p.siteName || '',
        projectLocation: p.deliverySiteId || p.siteName || '',
        orderType: 'concrete',
        quantity: p.totalVolumeM3 != null ? Number(p.totalVolumeM3) : 0,
        concreteType: p.mixDesignId || '',
        orderDate: p.scheduledDate || new Date().toISOString().slice(0, 10),
        salesRep: p.repName || auth.uid,
        status: 'pending',
        siteGeo:
          p.latitude != null && p.longitude != null
            ? `${Number(p.latitude)},${Number(p.longitude)}`
            : '',
        createdMobile: true,
        createdAt: new Date().toISOString(),
      };
      orders.unshift(order);
      await saveUserDataArr(auth.uid, 'orders', orders);
      const trips = await loadUserDataArr(auth.uid, 'trips');
      return ok(res, { ...mapOrder(order), ...orderDerived(order, trips) }, 'Order created');
    }

    return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (err) {
    console.error('[orders]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
