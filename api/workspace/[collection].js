/**
 * Tenant-scoped workspace blobs (replaces the legacy third-party Supabase tables).
 * GET  /api/workspace/:collection → { data: <blob> }
 * PUT  /api/workspace/:collection  body: <blob>
 *
 * Auth: Bearer access token (JWT from /api/auth/login). Data is stored per-user at
 * userData/{uid}/{collection}/data — same store the rest of the ERP uses.
 */
const {
  ok, fail, assertLegacyApiEnabled, requireAuth, loadUserDataArr, saveUserDataArr,
} = require('../_lib');

const ALLOWED = new Set([
  'adminPlantProfile', 'adminUsers', 'gpsLocations',
]);

module.exports = async function handler(req, res) {
  if (!assertLegacyApiEnabled(res)) return;
  const collection = String(req.query.collection || '');

  if (!ALLOWED.has(collection)) {
    return fail(res, 404, 'Collection غير معروفة', 'UNKNOWN_COLLECTION');
  }

  const auth = requireAuth(req, res);
  if (!auth) return null;

  try {
    if (req.method === 'GET') {
      const list = await loadUserDataArr(auth.uid, collection);
      // Blobs are stored as a single-element array wrapper by PUT below.
      const data = Array.isArray(list) && list.length === 1 && list[0] && Object.prototype.hasOwnProperty.call(list[0], '__blob')
        ? list[0].__blob
        : (Array.isArray(list) ? list : null);
      return ok(res, { data }, '');
    }

    if (req.method === 'PUT') {
      const body = req.body;
      if (body === undefined || body === null) {
        return fail(res, 400, 'بيانات ناقصة', 'EMPTY_BODY');
      }
      await saveUserDataArr(auth.uid, collection, [{ __blob: body }]);
      return ok(res, { saved: true }, 'تم الحفظ');
    }

    return fail(res, 405, 'Method not allowed', 'BAD_METHOD');
  } catch (err) {
    console.error(`[workspace/${collection}]`, err);
    return fail(res, 500, 'خطأ في الخادم', 'INTERNAL');
  }
};
