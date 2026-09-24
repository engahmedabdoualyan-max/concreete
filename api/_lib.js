/**
 * Shared helpers for the Fimto Concrete ERP mobile backend.
 * Deployed as Vercel serverless functions under /api.
 *
 * Auth model: the mobile APK logs in against the same Firebase `users`
 * collection the web app uses (tree accounts live there as users/{username}).
 * Passwords are stored in plaintext by the web app (legacy) so we compare
 * directly; we issue our own JWT pair on top.
 */

// Zero-dependency HS256 JWT (jsonwebtoken is unavailable on the static deploy target).
const crypto = require('crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
function jwtSign(payload, secret, expiresIn) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + (typeof expiresIn === 'string' ? parseInt(expiresIn) * (expiresIn.endsWith('d') ? 86400 : expiresIn.endsWith('h') ? 3600 : 1) : expiresIn || 3600);
  const body = b64url(JSON.stringify({ ...payload, exp }));
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function jwtVerify(token, secret) {
  try {
    const [h, b, s] = String(token).split('.');
    const expected = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (s !== expected) throw new Error('bad signature');
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expired');
    return payload;
  } catch { throw new Error('invalid token'); }
}
const jwt = { sign: jwtSign, verify: jwtVerify };

const PROJECT_ID = 'concrete-erb';
const API_KEY = process.env.FIREBASE_WEB_API_KEY || 'AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
function getJwtSecret() {
  const configured = process.env.JWT_SECRET;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  return configured || 'fimto-mobile-jwt-secret-v1-change-me';
}
const ACCESS_TOKEN_TTL = '12h';
const REFRESH_TOKEN_TTL = '30d';

// ─── Response envelope (matches mobile ApiResponse<T>) ────────────────────────

function ok(res, data, message = '') {
  res.status(200).json({ success: true, message, data, timestamp: new Date().toISOString() });
}

function fail(res, status, message, errorCode) {
  res.status(status).json({
    success: false,
    message,
    data: null,
    errorCode: errorCode || 'ERROR',
    timestamp: new Date().toISOString(),
  });
}

// The /api JavaScript backend is a legacy compatibility layer. Keep it usable
// in local development, but fail closed in production unless explicitly opted in.
function legacyApiEnabled() {
  return process.env.NODE_ENV !== 'production' || process.env.LEGACY_API_ENABLED === 'true';
}

function assertLegacyApiEnabled(res) {
  if (legacyApiEnabled()) return true;
  fail(res, 410, 'Legacy API is disabled', 'LEGACY_API_DISABLED');
  return false;
}

// ─── Legacy Firestore REST (kept for local compatibility only) ────────────────

function enc(part) {
  return encodeURIComponent(String(part));
}

async function fsGet(docPath) {
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}?key=${API_KEY}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore GET ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fsPatch(docPath, fields, mask) {
  const maskQs = (mask || Object.keys(fields))
    .map((m) => `updateMask.fieldPaths=${encodeURIComponent(m)}`)
    .join('&');
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}?key=${API_KEY}&${maskQs}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore PATCH ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fsDelete(docPath) {
  const res = await fetch(`${FIRESTORE_BASE}/${docPath}?key=${API_KEY}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`Firestore DELETE ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

async function fsQuery(collection, field, value) {
  const url = `${FIRESTORE_BASE}:runQuery?key=${API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
      },
      limit: 5,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  const found = (rows || [])
    .filter((r) => r.document)
    .map((r) => fromFirestore(r.document));
  return found[0] || null;
}

function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return Number(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.referenceValue !== undefined) return v.referenceValue;
  if (v.geoPointValue !== undefined) return v.geoPointValue;
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(decodeValue);
  if (v.mapValue !== undefined) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue.fields || {})) out[k] = decodeValue(val);
    return out;
  }
  return null;
}

function fromFirestore(doc) {
  if (!doc || !doc.fields) return {};
  const out = {};
  for (const [k, v] of Object.entries(doc.fields)) out[k] = decodeValue(v);
  return out;
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = encodeValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

async function loadUserDataArr(username, collection) {
  const doc = await fsGet(`userData/${enc(username)}/${collection}/data`);
  if (!doc || !doc.fields || !doc.fields.data) return [];
  const v = decodeValue(doc.fields.data);
  return Array.isArray(v) ? v : [];
}

async function saveUserDataArr(username, collection, arr) {
  const path = `userData/${enc(username)}/${collection}/data`;
  const fields = {
    data: encodeValue(arr),
    updatedAt: { stringValue: new Date().toISOString() },
  };
  return fsPatch(path, fields);
}

// ─── Users / auth ─────────────────────────────────────────────────────────────

async function findUser(identifier) {
  const id = String(identifier || '').trim().toLowerCase();
  if (!id) return null;

  const doc = await fsGet(`users/${enc(id)}`);
  if (doc) return fromFirestore(doc);

  for (const field of ['phone', 'email', 'username']) {
    const q = await fsQuery('users', field, id);
    if (q) return q;
  }
  return null;
}

async function findUserByUid(uid) {
  const doc = await fsGet(`users/${enc(uid)}`);
  return doc ? fromFirestore(doc) : null;
}

// Tree roles (web) → mobile roles. Unknown/legacy roles are denied elevated access.
const ROLE_MAP = {
  sysadmin: 'SUPER_ADMIN',
  ptown: 'SUPER_ADMIN',
  owner: 'SUPER_ADMIN',
  manager: 'SUPER_ADMIN',
  driver: 'DRIVER',
  sales: 'SALES_REP',
  accountant: 'ACCOUNTANT',
  storekeeper: 'ACCOUNTANT',
  workshopMgr: 'WORKSHOP_MGR',
  mechanic: 'WORKSHOP_MECHANIC',
  batchOp: 'BATCH_OPERATOR',
  labMgr: 'LAB_TECH',
  labTech: 'LAB_TECHNICIAN',
  operator: 'BATCH_OPERATOR',
  quality: 'LAB_TECH',
  maintenance: 'WORKSHOP_MECHANIC',
  viewer: 'DRIVER',
};

function mapRole(treeRole) {
  return ROLE_MAP[treeRole] || 'VIEWER';
}

function buildAuthUser(u) {
  return {
    id: u.username || '',
    employeeCode: u.username || '',
    fullName: u.roleAr || u.username || '',
    email: u.email || u.username || '',
    role: mapRole(u.role),
    zone: u.city || u.country || '',
  };
}

function signTokens(u) {
  const payload = { uid: u.username, email: u.email || '', role: mapRole(u.role), type: 'access' };
  const accessToken = jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = jwt.sign({ ...payload, type: 'refresh' }, getJwtSecret(), {
    expiresIn: REFRESH_TOKEN_TTL,
  });
  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
  };
}

// Reads the Bearer token; on failure writes a 401 and returns null.
function requireAuth(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    fail(res, 401, 'غير مصرح به', 'UNAUTHORIZED');
    return null;
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (!payload.uid || payload.type !== 'access') throw new Error('invalid token type');
    return payload;
  } catch (e) {
    fail(res, 401, 'انتهت الجلسة، سجل الدخول مرة أخرى', 'TOKEN_EXPIRED');
    return null;
  }
}

// ─── Data mappers (web data → mobile shapes) ─────────────────────────────────

function parseGeo(s) {
  if (!s) return null;
  const parts = String(s).split(',');
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

// ─── Derived delivery progress (RMC guard rail) ──────────────────────────────
// The order's delivered/pending are NEVER typed — they are recomputed from the
// completed trips that reference the order, so over-delivery is blocked at the
// source (mirrors DeliveryChallan.update_order_progress in midhuna-rmc).

function deliveredQtyForOrder(orderId, trips) {
  if (!orderId) return 0;
  return (trips || []).reduce((sum, t) => {
    const matches = String(t.orderId ?? '') === String(orderId) || String(t.id ?? t.code ?? '') === String(orderId);
    if (!matches) return sum;
    const completed = String(t.status || '').toUpperCase() === 'COMPLETED';
    if (!completed) return sum;
    return sum + (Number(t.qty) || 0);
  }, 0);
}

function orderDerived(order, trips) {
  const ordered = Number(order?.quantity) || 0;
  const delivered = deliveredQtyForOrder(order?.id ?? order?.orderNo, trips);
  return {
    deliveredQty: Math.round(delivered * 100) / 100,
    pendingQty: Math.max(0, Math.round((ordered - delivered) * 100) / 100),
    isFullyDelivered: ordered > 0 && delivered >= ordered - 0.001,
  };
}

function computeCycleMinutes(departHHMM, returnHHMM) {
  if (!departHHMM || !returnHHMM || departHHMM === '00:00' || returnHHMM === '00:00') return 0;
  const toMin = (s) => {
    const p = String(s).split(':').map(Number);
    return (p[0] || 0) * 60 + (p[1] || 0);
  };
  const mins = toMin(returnHHMM) - toMin(departHHMM);
  return mins > 0 ? mins : 0;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mapTrip(t, username) {
  const geo = parseGeo(t.siteGeo);
  const completed = String(t.status || '').toUpperCase() === 'COMPLETED';
  const cancelled = /cancel/i.test(String(t.status || ''));
  const siteArr = t.siteArr && t.siteArr !== '00:00' ? t.siteArr : null;
  const siteDep = t.siteDep && t.siteDep !== '00:00' ? t.siteDep : null;
  const stationDep = t.stationDep && t.stationDep !== '00:00' ? t.stationDep : null;
  const stationArr = t.stationArr && t.stationArr !== '00:00' ? t.stationArr : null;

  let currentCheckpoint = 'ARR_PLANT';
  if (t.currentCheckpoint && !completed && !cancelled) {
    currentCheckpoint = String(t.currentCheckpoint).toUpperCase();
  } else if (siteDep) currentCheckpoint = 'DEP_SITE';
  else if (siteArr) currentCheckpoint = 'ARR_SITE';
  else if (stationDep) currentCheckpoint = 'DEP_PLANT';
  else if (stationArr) currentCheckpoint = 'ARR_PLANT';

  return {
    id: String(t.id ?? t.code ?? ''),
    tripNumber: String(t.code || t.id || ''),
    orderId: t.orderId ? String(t.orderId) : '',
    vehicleId: t.pump ? String(t.pump) : '',
    driverId: username,
    mixDesignId: String(t.code || ''),
    loadedVolumeM3: t.qty != null ? String(t.qty) : '',
    currentCheckpoint,
    deliveryTicketNumber: null,
    isCompleted: completed,
    isCancelled: cancelled,
    cycleTimeMin: Number(t.cycleTimeMin) || 0,
    stageTimes: {
      dispatchTime: stationDep,
      siteArrivalTime: siteArr,
      unloadingEndTime: siteDep,
      returnTime: t.returnTime || null,
    },
    hasChallan: Boolean(t.challan && t.challan.receivedBy),
    createdAt: t.date ? String(t.date) : '',
    vehicleCode: t.pump ? String(t.pump) : '',
    plateNumber: '',
    clientName: t.projectName ? String(t.projectName) : '',
    siteName: t.siteName ? String(t.siteName) : '',
    siteLatitude: geo ? geo.lat : undefined,
    siteLongitude: geo ? geo.lng : undefined,
    geofenceRadiusMetres: 100,
    designCode: String(t.code || ''),
    gradeDescription: '',
    totalVolumeM3: t.qty != null ? String(t.qty) : '',
    remainingVolumeM3: t.qty != null ? String(t.qty) : '',
  };
}

const ORDER_STATUS_MAP = {
  pending: 'DRAFT',
  approved: 'APPROVED',
  scheduled: 'SCHEDULED',
  in_progress: 'IN_PRODUCTION',
  completed: 'DELIVERED',
  cancelled: 'CANCELLED',
};

function mapOrder(o) {
  const webStatus = String(o.status || 'pending').toLowerCase();
  return {
    id: String(o.id ?? o.orderNo ?? ''),
    orderNumber: String(o.orderNo || o.id || ''),
    status: ORDER_STATUS_MAP[webStatus] || 'DRAFT',
    totalVolumeM3: o.quantity != null ? String(o.quantity) : '',
    pricePerM3Sar: o.pricePerM3Sar != null ? Number(o.pricePerM3Sar) : 0,
    scheduledDate: o.orderDate ? String(o.orderDate) : '',
    paperClearanceGranted: Boolean(o.siteReady),
    financeApprovedAt: o.accountStatus === 'approved' && o.orderDate ? String(o.orderDate) : null,
    createdAt: o.orderDate ? String(o.orderDate) : '',
    companyName: o.customerName ? String(o.customerName) : '',
    clientCode: o.customerCode ? String(o.customerCode) : '',
    siteName: o.projectName ? String(o.projectName) : '',
    designCode: o.concreteType ? String(o.concreteType) : '',
    repName: o.salesRep ? String(o.salesRep) : '',
  };
}

function mapClient(c) {
  return {
    id: String(c.id ?? c.code ?? ''),
    clientCode: c.code ? String(c.code) : String(c.id ?? ''),
    companyName: c.name ? String(c.name) : '',
    phone: c.phone ? String(c.phone) : '',
    email: '',
    creditHold: Boolean(c.creditHold || c.hold || c.debtStatus === 'blocked'),
  };
}

function mapMixDesign(r) {
  return {
    id: String(r.code || ''),
    designCode: String(r.code || ''),
    gradeDescription: String(r.code || ''),
    targetStrengthMpa: r.cement != null ? String(r.cement) : '',
    targetSlumpCm: r.water != null ? String(r.water) : '',
  };
}

module.exports = {
  PROJECT_ID,
  API_KEY,
  FIRESTORE_BASE,
  getJwtSecret,
  jwt,
  ok,
  fail,
  legacyApiEnabled,
  assertLegacyApiEnabled,
  enc,
  fsGet,
  fsPatch,
  fsDelete,
  fsQuery,
  decodeValue,
  encodeValue,
  fromFirestore,
  loadUserDataArr,
  saveUserDataArr,
  findUser,
  findUserByUid,
  mapRole,
  buildAuthUser,
  signTokens,
  requireAuth,
  parseGeo,
  deliveredQtyForOrder,
  orderDerived,
  computeCycleMinutes,
  nowHHMM,
  mapTrip,
  mapOrder,
  mapClient,
  mapMixDesign,
};
