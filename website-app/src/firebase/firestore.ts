/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP · Website data layer
 * ============================================================
 *
 *  Unified data layer: every collection is now stored on the ERP
 *  PostgreSQL server via /api/workspace (scoped to the logged-in
 *  tenant), replacing Firestore. All function signatures are kept
 *  identical so pages/components work unchanged.
 *
 *  A localStorage cache acts as an offline fallback so the UI
 *  never hard-crashes when the network/token is unavailable.
 * ============================================================
 */

import { api, getToken, loadSession } from "../api/client";

// ====================== Storage Quota ======================
export const DEFAULT_QUOTA_MB = 300;

export const USER_DATA_COLLECTIONS = [
  'trips', 'oeeLogs', 'recipes', 'calibrationLogs', 'inventory', 'deliveries',
  'productionRuns', 'qcRecords', 'assets', 'workshopConfig', 'customers', 'plantProfile',
  'weighbridgeRecords', 'returnedConcrete', 'payments', 'purchaseOrders', 'rawStock',
  'plants', 'blockPlants', 'gpsConfig', 'gpsHistory', 'livePositions',
  'orders', 'notifications',
];

const CACHE_PREFIX = "ws_cache_";

function cacheKey(collection: string): string {
  const tenant = loadSession()?.tenantId || "anon";
  return `${CACHE_PREFIX}${tenant}_${collection}`;
}

function readCache<T>(collection: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(collection));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(collection: string, data: unknown): void {
  try {
    localStorage.setItem(cacheKey(collection), JSON.stringify(data));
  } catch {
    /* quota exceeded — ignore */
  }
}

function cleanForStore(v: any): any {
  if (Array.isArray(v)) return v.map(cleanForStore);
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = cleanForStore(v[k]);
    return o;
  }
  return v;
}

// حساب الاستخدام الفعلي للمستخدم (متاح للموازنة — التخزين الآن بلا حدود)
export async function computeUserStorageBytes(_userId: string): Promise<number> {
  return 0;
}

export async function refreshStorageUsage(_userId: string): Promise<void> {
  /* no-op: storage is unlimited on the unified server */
}

export async function getStorageStatus(_username: string) {
  return {
    quotaMB: DEFAULT_QUOTA_MB,
    usedMB: 0,
    remainingMB: DEFAULT_QUOTA_MB,
    pct: 0,
    overQuota: false,
  };
}

// ====================== Users ======================
// Registration moved to the ERP admin panel; these are kept as no-ops
// so existing call sites still compile and behave safely.
export async function saveUser(user: any) {
  try { localStorage.setItem("registeredUsers", JSON.stringify([user])); } catch { }
}

export async function getUser(_username: string) {
  return null;
}

export async function getAllUsers() {
  return [];
}

// ====================== User Data Helpers ======================
export async function saveUserData(_userId: string, collectionName: string, data: any): Promise<boolean> {
  const clean = cleanForStore(data);
  writeCache(collectionName, clean);
  if (!getToken()) return true; // offline: cache only
  try {
    await api.put(`/api/workspace/${collectionName}`, clean);
  } catch {
    // keep the cache copy — the next online save will sync it
  }
  return true;
}

export async function loadUserData(_userId: string, collectionName: string): Promise<any> {
  if (getToken()) {
    try {
      const res = await api.get<{ data: any }>(`/api/workspace/${collectionName}`);
      if (res?.data != null) {
        writeCache(collectionName, res.data);
        return res.data;
      }
    } catch {
      /* fall through to cache */
    }
  }
  return readCache<any>(collectionName) ?? null;
}

// ====================== Trips (Operations) ======================
export async function saveTrips(userId: string, trips: any[]) { await saveUserData(userId, 'trips', trips); }
export async function loadTrips(userId: string) { return await loadUserData(userId, 'trips'); }

// ====================== OEE Logs (Evaluation) ======================
export async function saveOEELogs(userId: string, logs: any[]) { await saveUserData(userId, 'oeeLogs', logs); }
export async function loadOEELogs(userId: string) { return await loadUserData(userId, 'oeeLogs'); }

// ====================== Recipes (Mixing) ======================
export async function saveRecipes(userId: string, recipes: any[]) { await saveUserData(userId, 'recipes', recipes); }
export async function loadRecipes(userId: string) { return await loadUserData(userId, 'recipes'); }

// ====================== Calibration Logs ======================
export async function saveCalibrationLogs(userId: string, logs: any[]) { await saveUserData(userId, 'calibrationLogs', logs); }
export async function loadCalibrationLogs(userId: string) { return await loadUserData(userId, 'calibrationLogs'); }

// ====================== Inventory ======================
export async function saveInventory(userId: string, inventory: any) { await saveUserData(userId, 'inventory', inventory); }
export async function loadInventory(userId: string) { return await loadUserData(userId, 'inventory'); }

// ====================== Deliveries ======================
export async function saveDeliveries(userId: string, deliveries: any[]) { await saveUserData(userId, 'deliveries', deliveries); }
export async function loadDeliveries(userId: string) { return await loadUserData(userId, 'deliveries'); }

// ====================== Production Runs ======================
export async function saveProductionRuns(userId: string, runs: any[]) { await saveUserData(userId, 'productionRuns', runs); }
export async function loadProductionRuns(userId: string) { return await loadUserData(userId, 'productionRuns'); }

// ====================== QC Records ======================
export async function saveQCRecords(userId: string, records: any[]) { await saveUserData(userId, 'qcRecords', records); }
export async function loadQCRecords(userId: string) { return await loadUserData(userId, 'qcRecords'); }

// ====================== Assets (Workshop) ======================
export async function saveAssets(userId: string, assets: any[]) { await saveUserData(userId, 'assets', assets); }
export async function loadAssets(userId: string) { return await loadUserData(userId, 'assets'); }

// ====================== Workshop Config ======================
export async function saveWorkshopConfig(userId: string, config: any) { await saveUserData(userId, 'workshopConfig', config); }
export async function loadWorkshopConfig(userId: string) { return await loadUserData(userId, 'workshopConfig'); }

// ====================== Customer Database (Schedule) ======================
export async function saveCustomers(userId: string, customers: any[]) { await saveUserData(userId, 'customers', customers); }
export async function loadCustomers(userId: string) { return await loadUserData(userId, 'customers'); }

// ====================== Plant Profile ======================
export async function savePlantProfile(userId: string, profile: any) { await saveUserData(userId, 'plantProfile', profile); }
export async function loadPlantProfile(userId: string) {
  const p = await loadUserData(userId, 'plantProfile');
  return p ?? { name: '', logo: '' };
}

// ====================== Plant Logo ======================
export async function savePlantLogo(userId: string, logoDataUrl: string) {
  const prev = await loadPlantProfile(userId);
  await savePlantProfile(userId, { ...prev, logo: logoDataUrl, logoUpdatedAt: new Date().toISOString() });
}
export async function loadPlantLogo(userId: string): Promise<string> {
  const profile = await loadPlantProfile(userId);
  return profile?.logo || '';
}

// ====================== GPS Feed Config (live tracker linking) ======================
export async function saveGpsConfig(userId: string, cfg: any) { await saveUserData(userId, 'gpsConfig', cfg); }
export async function loadGpsConfig(userId: string) { return await loadUserData(userId, 'gpsConfig'); }

// ====================== GPS Route History ======================
export async function saveGpsHistory(userId: string, entry: { vehicle: string; date: string; points: Array<[number, number]> }) {
  const list = (await loadUserData(userId, 'gpsHistory')) || [];
  const filtered = list.filter((e: any) => !(e.vehicle === entry.vehicle && e.date === entry.date));
  await saveUserData(userId, 'gpsHistory', [...filtered, entry]);
}
export async function loadGpsHistory(userId: string) { return await loadUserData(userId, 'gpsHistory'); }

// ====================== Driver Live Location (mobile fallback GPS) ======================
export interface LivePosEntry {
  assetId: string;
  lat: number;
  lng: number;
  ts: number;
  speed?: number;
  accuracy?: number;
}
export async function saveLivePosition(userId: string, entry: LivePosEntry) {
  const list = (await loadUserData(userId, 'livePositions')) || [];
  const next = list.filter((e: any) => e.assetId !== entry.assetId);
  next.push(entry);
  await saveUserData(userId, 'livePositions', next);
}
export async function loadLivePositions(userId: string): Promise<LivePosEntry[]> {
  return (await loadUserData(userId, 'livePositions')) || [];
}
export async function getAllLivePositions(): Promise<Array<LivePosEntry & { username: string; plantName: string }>> {
  const out: Array<LivePosEntry & { username: string; plantName: string }> = [];
  try {
    const summary = await api.get<{ tenants: any[] }>("/api/workspace/summary");
    for (const t of summary?.tenants ?? []) {
      if (Array.isArray(t.livePositions)) {
        t.livePositions.forEach((e: LivePosEntry) =>
          out.push({ ...e, username: t.tenantCode || t.tenantId, plantName: t.plantName || t.companyName || "—" })
        );
      }
    }
  } catch {
    const mine = await loadLivePositions(loadSession()?.id || "");
    mine.forEach((e) => out.push({ ...e, username: loadSession()?.employeeCode || "me", plantName: "Me" }));
  }
  return out;
}

// ====================== Plants (multi-site) ======================
export async function savePlants(userId: string, plants: any[]) { await saveUserData(userId, 'plants', plants); }
export async function loadPlants(userId: string) { return await loadUserData(userId, 'plants'); }

// ====================== Block Factories (block production lines) ======================
export async function saveBlockPlants(userId: string, blockPlants: any[]) { await saveUserData(userId, 'blockPlants', blockPlants); }
export async function loadBlockPlants(userId: string) { return await loadUserData(userId, 'blockPlants'); }

// ====================== Shared GPS (plant location) ======================
export async function savePlantGPS(userId: string, lat: number, lng: number) {
  const prev = await loadPlantProfile(userId);
  await savePlantProfile(userId, { ...prev, gpsLat: lat, gpsLng: lng, gpsUpdatedAt: new Date().toISOString() });
}
export async function loadPlantGPS(userId: string): Promise<{ lat: number; lng: number } | null> {
  const profile = await loadPlantProfile(userId);
  if (profile && typeof profile.gpsLat === 'number' && typeof profile.gpsLng === 'number') {
    return { lat: profile.gpsLat, lng: profile.gpsLng };
  }
  return null;
}

// ====================== Weighbridge (Governance) ======================
export async function saveWeighbridgeRecords(userId: string, records: any[]) { await saveUserData(userId, 'weighbridgeRecords', records); }
export async function loadWeighbridgeRecords(userId: string) { return await loadUserData(userId, 'weighbridgeRecords'); }

// ====================== Returned Concrete (Governance) ======================
export async function saveReturns(userId: string, records: any[]) { await saveUserData(userId, 'returnedConcrete', records); }
export async function loadReturns(userId: string) { return await loadUserData(userId, 'returnedConcrete'); }

// ====================== Payments (Finance) ======================
export async function savePayments(userId: string, records: any[]) { await saveUserData(userId, 'payments', records); }
export async function loadPayments(userId: string) { return await loadUserData(userId, 'payments'); }

// ====================== Purchase Orders (Finance) ======================
export async function savePurchaseOrders(userId: string, records: any[]) { await saveUserData(userId, 'purchaseOrders', records); }
export async function loadPurchaseOrders(userId: string) { return await loadUserData(userId, 'purchaseOrders'); }

// ====================== Raw Material Stock (Reorder) ======================
export async function saveRawStock(userId: string, stock: any) { await saveUserData(userId, 'rawStock', stock); }
export async function loadRawStock(userId: string) { return await loadUserData(userId, 'rawStock'); }

// ====================== Orders (Orders page) ======================
export async function saveOrders(userId: string, records: any[]) { await saveUserData(userId, 'orders', records); }
export async function loadOrders(userId: string) { return await loadUserData(userId, 'orders'); }

// ====================== Notifications (linkage events) ======================
export interface Notification {
  id: string;
  ts: string;
  level: 'info' | 'success' | 'warn' | 'error';
  title: string;
  body: string;
  ref?: string;
  read: boolean;
}
export async function loadNotifications(userId: string): Promise<Notification[]> {
  const data = await loadUserData(userId, 'notifications');
  return Array.isArray(data) ? data : [];
}
export async function addNotification(userId: string, n: Omit<Notification, 'id' | 'ts' | 'read'>): Promise<void> {
  const list = await loadNotifications(userId).catch(() => []);
  const entry: Notification = {
    ...n,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    ts: new Date().toISOString(),
    read: false,
  };
  await saveUserData(userId, 'notifications', [entry, ...list].slice(0, 80));
}
export async function markNotificationsRead(userId: string): Promise<void> {
  const list = await loadNotifications(userId).catch(() => []);
  if (!list.length) return;
  await saveUserData(userId, 'notifications', list.map(n => ({ ...n, read: true })));
}

// ====================== Multi-Plant (owner) ======================
export interface PlantSummary {
  username: string;
  plantName: string;
  country: string;
  city: string;
  trips: number;
  tripList: any[];
  totalVolume: number;
  inventory: Record<string, number>;
  qcCount: number;
  orders: any[];
  payments: any[];
  pos: any[];
}

export async function getAllPlantsSummary(): Promise<PlantSummary[]> {
  const out: PlantSummary[] = [];
  try {
    const summary = await api.get<{ tenants: any[] }>("/api/workspace/summary");
    for (const t of summary?.tenants ?? []) {
      out.push({
        username: t.tenantCode || t.tenantId,
        plantName: t.plantName || t.companyName || t.tenantCode,
        country: t.country || '—',
        city: t.city || '—',
        trips: Number(t.trips ?? 0) + Number(t.workspaceTrips ?? 0),
        tripList: Array.isArray(t.livePositions) ? [] : [],
        totalVolume: 0,
        inventory: t.profile?.inventory || {},
        qcCount: Number(t.workspaceQc ?? 0),
        orders: [],
        payments: [],
        pos: [],
      });
    }
  } catch {
    /* fall back to own-tenant loaders below */
  }
  if (!out.length) {
    const session = loadSession();
    const username = session?.employeeCode || "me";
    const trips = (await loadTrips(username)) || [];
    out.push({
      username,
      plantName: session?.fullName || "My Plant",
      country: "—",
      city: "—",
      trips: trips.length,
      tripList: trips,
      totalVolume: trips.reduce((s: number, t: any) => s + (Number(t.qty) || 0), 0),
      inventory: {},
      qcCount: ((await loadQCRecords(username)) || []).length,
      orders: [],
      payments: [],
      pos: [],
    });
  }
  return out;
}
