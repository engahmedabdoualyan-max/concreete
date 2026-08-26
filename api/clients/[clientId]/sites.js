const {
  ok, fail, requireAuth, loadUserDataArr,
} = require('../../_lib');

// api/clients/[clientId]/sites.js → GET /api/clients/:clientId/sites
module.exports = async function handler(req, res) {
  const clientId = String(req.query.clientId || '');
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;

    if (method === 'GET') {
      const customers = await loadUserDataArr(auth.uid, 'customers');
      const customer = (customers || []).find((c) => String(c.id ?? c.code ?? '') === clientId);
      const sites = [];
      if (customer) {
        const addr = customer.address || customer.name || 'Site';
        sites.push({
          id: `${customer.code || customer.id}-site`,
          siteName: String(addr),
          siteCode: `S-${customer.code || customer.id}`,
          city: '',
          geofenceRadiusMetres: 100,
        });
      }
      const orders = await loadUserDataArr(auth.uid, 'orders');
      const seen = new Set(sites.map((s) => s.siteName));
      for (const o of orders || []) {
        const ref = String(o.customerId ?? o.customerCode ?? '');
        if (ref && ref !== clientId) continue;
        const siteName = String(o.projectName || '').trim();
        if (!siteName || seen.has(siteName)) continue;
        seen.add(siteName);
        const geo = typeof o.locationCoords === 'string' ? o.locationCoords.split(',') : [];
        sites.push({
          id: `${String(o.id ?? '')}-site`,
          siteName,
          siteCode: `S-${String(o.id ?? '').slice(-4)}`,
          city: '',
          latitude: geo[0] ? String(parseFloat(geo[0]) || '') : undefined,
          longitude: geo[1] ? String(parseFloat(geo[1]) || '') : undefined,
          geofenceRadiusMetres: 100,
        });
      }
      return ok(res, sites, 'Sites list');
    }

    return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (err) {
    console.error('[sites]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
