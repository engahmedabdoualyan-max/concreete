const {
  ok, fail, requireAuth, loadUserDataArr, mapMixDesign,
} = require('../_lib');

// api/mix-designs/index.js → GET /api/mix-designs
module.exports = async function handler(req, res) {
  const method = req.method;
  try {
    const auth = requireAuth(req, res);
    if (!auth) return null;

    if (method === 'GET') {
      const recipes = await loadUserDataArr(auth.uid, 'recipes');
      return ok(res, (recipes || []).map(mapMixDesign), 'Mix designs list');
    }

    return fail(res, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (err) {
    console.error('[mix-designs]', err);
    return fail(res, 500, 'حدث خطأ في الخادم', 'INTERNAL');
  }
};
