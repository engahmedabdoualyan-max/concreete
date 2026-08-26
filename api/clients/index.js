const {
  ok, fail, requireAuth, loadUserDataArr, mapClient,
} = require('../_lib');

// api/clients/index.js → GET /api/clients
module.exports = async function handler(req, res) {
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;

    if (method === 'GET') {
      const customers = await loadUserDataArr(auth.uid, 'customers');
      return ok(res, (customers || []).map(mapClient), 'Clients list');
    }

    return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (err) {
    console.error('[clients]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
