/**
 * Fimto Concrete Mobile API — Express server
 *
 * Reads/writes the same Firebase Firestore used by the web app
 * (project `concrete-erb`). Runs standalone next to the Vite web app.
 *
 * Run:
 *   cd mobile-api && npm install express firebase-admin qrcode
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *   export PORT=8080
 *   node server.js
 *
 * If no service account key is present it falls back to an in-memory store
 * (demo mode) so the API structure can be exercised immediately.
 */
const express = require('express');
const QRCode = require('qrcode');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(require('cors')());

const PORT = process.env.PORT || 8080;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev-secret-change-me';

// ---------- Data layer: Firestore (or in-memory fallback) ----------
let db = null;
let memory = { trips: [], orders: [], locations: {} };

function initDb() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.warn('[api] No service account — running in demo (in-memory) mode');
    return;
  }
  try {
    const admin = require('firebase-admin');
    const app = admin.initializeApp({ projectId: process.env.FIRESTORE_PROJECT_ID || 'concrete-erb' });
    db = admin.firestore(app);
    console.log('[api] Connected to Firestore project concrete-erb');
  } catch (e) {
    console.error('[api] Firestore init failed, using in-memory:', e.message);
  }
}

async function loadCollection(name) {
  if (db) {
    const snap = await db.collection(name).get();
    return snap.docs.map(d => d.data());
  }
  return memory[name] || [];
}
async function saveCollection(name, items) {
  if (db) {
    const batch = db.batch();
    items.forEach(item => batch.set(db.collection(name).doc(String(item.id)), item));
    await batch.commit();
    return;
  }
  memory[name] = items;
}
async function getTrip(id) {
  const trips = await loadCollection('trips');
  return trips.find(t => String(t.id) === String(id));
}

// ---------- ZATCA-compatible QR payload ----------
function encodeTLV(parts) {
  const bytes = [];
  for (const p of parts) {
    const v = Buffer.from(p.value, 'utf8');
    bytes.push(p.tag, v.length, ...v);
  }
  return Buffer.from(bytes).toString('base64');
}

// ---------- Simple bearer auth ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, db: db ? 'firestore' : 'memory' }));
app.use('/api', (req, res, next) => {
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${ADMIN_TOKEN}`) return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

// ============================ DRIVER APP ============================
// Today's trips for a driver
app.get('/api/driver/trips', async (req, res) => {
  const { driver } = req.query;
  if (!driver) return res.status(400).json({ error: 'driver query param required' });
  const trips = (await loadCollection('trips'))
    .filter(t => t.driver === driver || driver === 'all')
    .sort((a, b) => (a.date + a.stationArr).localeCompare(b.date + b.stationArr));
  res.json(trips);
});

app.get('/api/driver/trips/:id', async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  res.json(trip);
});

// Driver changes status (PLANT → TRANSIT → UNLOADING → COMPLETED)
app.patch('/api/driver/trips/:id/status', async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const { status, stationDep, siteArr, siteDep, delayReason } = req.body;
  const updated = { ...trip };
  if (status) updated.status = status;
  if (stationDep) updated.stationDep = stationDep;
  if (siteArr) updated.siteArr = siteArr;
  if (siteDep) updated.siteDep = siteDep;
  if (delayReason) { updated.delayReason = delayReason; updated.status = 'UNLOADING'; }
  const trips = await loadCollection('trips');
  await saveCollection('trips', trips.map(t => (String(t.id) === String(trip.id) ? updated : t)));
  res.json(updated);
});

// Driver pushes GPS position → updates trip siteGeo (live map feed)
app.post('/api/driver/trips/:id/location', async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng (numbers) required' });
  }
  const updated = { ...trip, siteGeo: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
  const trips = await loadCollection('trips');
  await saveCollection('trips', trips.map(t => (String(t.id) === String(trip.id) ? updated : t)));
  res.json({ ok: true, siteGeo: updated.siteGeo });
});

// Driver submits delivery note number
app.post('/api/driver/trips/:id/bon', async (req, res) => {
  const trip = await getTrip(req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trip not found' });
  const { bonNo } = req.body;
  if (!bonNo) return res.status(400).json({ error: 'bonNo required' });
  const updated = { ...trip, bonNo, status: 'COMPLETED' };
  const trips = await loadCollection('trips');
  await saveCollection('trips', trips.map(t => (String(t.id) === String(trip.id) ? updated : t)));
  res.json(updated);
});

// ============================ CLIENT APP ============================
// Order history for a client
app.get('/api/client/orders', async (req, res) => {
  const { customerCode, phone } = req.query;
  let orders = await loadCollection('orders');
  if (customerCode) orders = orders.filter(o => o.customerCode === customerCode);
  if (phone) orders = orders.filter(o => o.customerPhone === phone);
  res.json(orders);
});

// Client creates a new order request (status pending)
app.post('/api/client/orders', async (req, res) => {
  const { customerName, quantity, concreteType } = req.body;
  if (!customerName || !quantity || !concreteType) {
    return res.status(400).json({ error: 'customerName, quantity, concreteType required' });
  }
  const order = {
    id: 'o_' + Date.now(),
    orderDate: new Date().toISOString().split('T')[0],
    status: 'pending',
    accountStatus: 'pending',
    debtStatus: 'clear',
    ...req.body,
  };
  const orders = await loadCollection('orders');
  await saveCollection('orders', [...orders, order]);
  res.status(201).json(order);
});

// E-invoice with ZATCA QR for a completed order
app.get('/api/client/orders/:id/invoice', async (req, res) => {
  const orders = await loadCollection('orders');
  const order = orders.find(o => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const unitPrice = { '2000': 2100, '2500': 2400, '3000': 2700, '3500': 3000, '4000': 3300, '5000': 4000 }[order.concreteType] || 2700;
  const totalExVat = unitPrice * order.quantity;
  const vatAmount = totalExVat * 0.15;
  const payload = encodeTLV([
    { tag: 1, value: 'Fimto Concrete Plant' },
    { tag: 2, value: '3-123-456-7890' },
    { tag: 3, value: new Date().toISOString() },
    { tag: 4, value: totalExVat.toFixed(2) },
    { tag: 5, value: vatAmount.toFixed(2) },
  ]);
  const qrImage = await QRCode.toDataURL(payload, { margin: 1, width: 220 });
  res.json({
    invoiceNo: 'INV-' + String(order.id).slice(-6).toUpperCase(),
    date: order.orderDate,
    totalExVat: +totalExVat.toFixed(2),
    vatAmount: +vatAmount.toFixed(2),
    total: +(totalExVat + vatAmount).toFixed(2),
    currency: 'SAR',
    qrPayload: payload,
    qrImage,
  });
});

// ============================ PLANT / TRACKING ============================
// Live fleet positions (web Fleet Map + client tracking)
app.get('/api/plant/live', async (req, res) => {
  const trips = (await loadCollection('trips')).filter(t => t.siteGeo);
  res.json(trips);
});

initDb();
app.listen(PORT, () => console.log(`[api] Mobile API listening on :${PORT}`));
