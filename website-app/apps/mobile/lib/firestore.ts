/**
 * Native ERP Data Layer — Firestore REST
 * ========================================
 * Reads and writes the EXACT SAME storage locations the website uses
 * (`userData/{username}/{collection}/data`), so the native dashboard modules
 * see the owner's real data. Firestore rules are public read/write, so plain
 * REST `fetch` works — no Firebase SDK / native module required.
 */

import type { AuthUser } from "@/types";
import { authHeaders } from "./fb-auth";

const FIREBASE_PROJECT = "concrete-erb";
const FIREBASE_API_KEY = "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE";
const BASE =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}` +
  `/databases/%28default%29/documents`;
const DEFAULT_QUOTA_MB = 300;

export function dataUsername(user?: AuthUser | null): string {
  if (!user) return "elkhaleej";
  const zone = (user.zone || "").trim().toLowerCase();
  if (zone) return zone;
  const em = (user.email || "").split("@")[0].trim().toLowerCase();
  if (em) return em;
  return "elkhaleej";
}

// ─── Firestore Value encoding / decoding ───────────────────────────────────────

function encode(v: any): any {
  if (v === undefined) return null;
  if (v === null) return { nullValue: null };
  const t = typeof v;
  if (t === "string") return { stringValue: v };
  if (t === "boolean") return { booleanValue: v };
  if (t === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode).filter(Boolean) } };
  if (t === "object") {
    const fields: Record<string, any> = {};
    for (const k of Object.keys(v)) {
      if (v[k] === undefined) continue;
      const e = encode(v[k]);
      if (e) fields[k] = e;
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function decode(v: any): any {
  if (!v || typeof v !== "object") return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("referenceValue" in v) return v.referenceValue;
  if ("arrayValue" in v) return (v.arrayValue?.values || []).map(decode);
  if ("mapValue" in v) {
    const o: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue?.fields || {})) o[k] = decode(val);
    return o;
  }
  return v;
}

async function fsGet(path: string): Promise<any> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE}/${path}?key=${FIREBASE_API_KEY}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET ${path} → ${res.status}`);
  const json = await res.json();
  const fields = json.fields ?? {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

async function fsSet(path: string, body: any): Promise<void> {
  const res = await fetch(
    `${BASE}/${path}?updateMask.fieldPaths=data&updateMask.fieldPaths=updatedAt&key=${FIREBASE_API_KEY}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error(`Firestore PATCH ${path} → ${res.status}`);
}

/**
 * Online presence — writes `lastSeenAt` (ms epoch) to `users/{username}` so the
 * website Console / Admin "المتواجدون الآن" panel shows mobile users as online.
 * Uses the same doc id the website uses (tree accounts → their login email).
 * Purposely fire-and-forget: never blocks the UI on a failed heartbeat.
 */
export async function reportPresence(username?: string | null): Promise<void> {
  const uname = String((username || "").trim().toLowerCase());
  if (!uname) return;
  try {
    await fetch(
      `${BASE}/users/${encodeURIComponent(uname)}?updateMask.fieldPaths=lastSeenAt&key=${FIREBASE_API_KEY}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ fields: { lastSeenAt: { integerValue: String(Date.now()) } } }),
      }
    );
  } catch (err) {
    console.warn("[presence] report failed", err);
  }
}

/**
 * Server-stamped writes via the Firestore Commit API.
 * Field transforms (`setToServerValue: "REQUEST_TIME"`) make Firestore itself
 * record the timestamp — clients can NOT forge it (anti-tamper audit trail).
 */
async function fsCommit(
  path: string,
  writes: any[]
): Promise<void> {
  const res = await fetch(`${BASE}:commit?key=${FIREBASE_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Firestore COMMIT ${path} → ${res.status} ${txt.slice(0, 200)}`);
  }
}

/** Quote a map key for use inside a Firestore field path (dashes, digits, unicode). */
function quoteSeg(seg: string): string {
  return "`" + String(seg).replace(/`/g, "\\`") + "`";
}

async function getUserDoc(username: string): Promise<any> {
  try {
    return await fsGet(`users/${username}`);
  } catch {
    return null;
  }
}

async function updateUserQuota(username: string, usedBytes: number): Promise<void> {
  try {
    const doc = await getUserDoc(username);
    const quotaMB = doc?.storageQuotaMB || DEFAULT_QUOTA_MB;
    const over = usedBytes > quotaMB * 1024 * 1024;
    await fsSet(`users/${username}`, {
      fields: {
        storageUsedBytes: { integerValue: String(usedBytes) },
        storageUsedMB: { doubleValue: parseFloat((usedBytes / (1024 * 1024)).toFixed(3)) },
        storageQuotaMB: { integerValue: String(quotaMB) },
        overQuota: { booleanValue: over },
        lastUsageUpdate: { timestampValue: new Date().toISOString() },
      },
    });
  } catch {
    // quota bookkeeping must never block the data write
  }
}

// ─── Generic per-collection load / save (mirrors website userData helpers) ─────

async function loadUserData(username: string, collection: string): Promise<any> {
  const doc = await fsGet(`userData/${username}/${collection}/data`);
  return doc ? (doc.data ?? null) : null;
}

async function saveUserData(username: string, collection: string, data: any): Promise<boolean> {
  const userDoc = await getUserDoc(username);
  const quotaMB = userDoc?.storageQuotaMB || DEFAULT_QUOTA_MB;
  const usedBytes = Number(userDoc?.storageUsedBytes) || 0;
  const prev = await fsGet(`userData/${username}/${collection}/data`);
  const prevLen = prev ? JSON.stringify(prev).length : 0;
  const newLen = JSON.stringify({ data }).length;
  if (usedBytes + newLen - prevLen > quotaMB * 1024 * 1024) return false;

  await fsSet(`userData/${username}/${collection}/data`, {
    fields: {
      data: encode(data),
      updatedAt: { timestampValue: new Date().toISOString() },
    },
  });
  void updateUserQuota(username, usedBytes + newLen - prevLen);
  return true;
}

// ─── Typed ERP loaders (exact same collections as the website) ─────────────────

export const erp = {
  dataUsername,

  loadTrips: (u: string) => loadUserData(u, "trips"),
  saveTrips: (u: string, v: any[]) => saveUserData(u, "trips", v),

  /**
   * Load orders WITH the server-stamped audit map (`orderTimes`) merged in.
   * Every order gets `serverCreatedAt` / `serverApprovedAt` / `serverUpdatedAt`
   * (ISO strings, written by Firestore — not the phone) when available.
   */
  loadOrders: async (u: string) => {
    const doc = await fsGet(`userData/${u}/orders/data`);
    if (!doc) return null;
    const list = Array.isArray(doc.data) ? doc.data : null;
    const times = doc.orderTimes && typeof doc.orderTimes === "object" ? doc.orderTimes : {};
    if (!list) return list;
    return list.map((o: any) => {
      const t = o && o.id ? times[o.id] : null;
      if (!t || typeof t !== "object") return o;
      return {
        ...o,
        serverCreatedAt: t.createdAt ?? o.serverCreatedAt,
        serverApprovedAt: t.approvedAt ?? o.serverApprovedAt,
        serverUpdatedAt: t.updatedAt ?? o.serverUpdatedAt,
      };
    });
  },

  /**
   * Save the orders array AND server-stamp audit timestamps for the given
   * order ids. `stamps` maps orderId → { createdAt?, approvedAt?, updatedAt? }.
   * Uses a single Commit: one write updates `data`, then field transforms ask
   * Firestore to record REQUEST_TIME — so the phone cannot fake the time.
   */
  saveOrders: async (
    u: string,
    v: any[],
    stamps?: Record<string, { createdAt?: boolean; approvedAt?: boolean; updatedAt?: boolean }>
  ): Promise<boolean> => {
    const ok = await saveUserData(u, "orders", v);
    if (!ok) return false;
    const stampEntries = Object.entries(stamps || {});
    if (stampEntries.length) {
      const path = `userData/${u}/orders/data`;
      const transforms: any[] = [
        { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
      ];
      for (const [id, s] of stampEntries) {
        if (s.createdAt)
          transforms.push({ fieldPath: `orderTimes.${quoteSeg(id)}.createdAt`, setToServerValue: "REQUEST_TIME" });
        if (s.approvedAt)
          transforms.push({ fieldPath: `orderTimes.${quoteSeg(id)}.approvedAt`, setToServerValue: "REQUEST_TIME" });
        if (s.updatedAt)
          transforms.push({ fieldPath: `orderTimes.${quoteSeg(id)}.updatedAt`, setToServerValue: "REQUEST_TIME" });
      }
      try {
        await fsCommit(path, [
          {
            update: { name: `projects/${FIREBASE_PROJECT}/databases/(default)/documents/${path}`, fields: {} },
            updateMask: { fieldPaths: [] },
            updateTransforms: transforms,
          },
        ]);
      } catch (err) {
        console.warn("[erp] server stamp failed (order times may be missing)", err);
      }
    }
    return true;
  },

  /** Plant display name (from the users doc) — shown so cross-plant data is visible. */
  loadPlantName: async (u: string) => {
    try {
      const doc = await fsGet(`users/${u.toLowerCase()}`);
      return doc?.plantName || doc?.name || doc?.username || u;
    } catch {
      return u;
    }
  },

  loadCustomers: (u: string) => loadUserData(u, "customers"),
  saveCustomers: (u: string, v: any[]) => saveUserData(u, "customers", v),
  loadProductionRuns: (u: string) => loadUserData(u, "productionRuns"),
  saveProductionRuns: (u: string, v: any[]) => saveUserData(u, "productionRuns", v),
  loadInventory: (u: string) => loadUserData(u, "inventory"),
  saveInventory: (u: string, v: any) => saveUserData(u, "inventory", v),
  loadRecipes: (u: string) => loadUserData(u, "recipes"),
  saveRecipes: (u: string, v: any[]) => saveUserData(u, "recipes", v),
  loadQCRecords: (u: string) => loadUserData(u, "qcRecords"),
  saveQCRecords: (u: string, v: any[]) => saveUserData(u, "qcRecords", v),
  loadSamples: (u: string) => loadUserData(u, "samples"),
  saveSamples: (u: string, v: any[]) => saveUserData(u, "samples", v),
  loadCalibrationLogs: (u: string) => loadUserData(u, "calibrationLogs"),
  saveCalibrationLogs: (u: string, v: any[]) => saveUserData(u, "calibrationLogs", v),
  loadOEELogs: (u: string) => loadUserData(u, "oeeLogs"),
  saveOEELogs: (u: string, v: any[]) => saveUserData(u, "oeeLogs", v),
  loadAssets: (u: string) => loadUserData(u, "assets"),
  saveAssets: (u: string, v: any[]) => saveUserData(u, "assets", v),
  loadWorkshopConfig: (u: string) => loadUserData(u, "workshopConfig"),
  saveWorkshopConfig: (u: string, v: any) => saveUserData(u, "workshopConfig", v),
  loadFuelLogs: (u: string) => loadUserData(u, "ws_fuel"),
  saveFuelLogs: (u: string, v: any[]) => saveUserData(u, "ws_fuel", v),
  loadOilLogs: (u: string) => loadUserData(u, "ws_oil"),
  saveOilLogs: (u: string, v: any[]) => saveUserData(u, "ws_oil", v),
  loadSparePartLogs: (u: string) => loadUserData(u, "ws_parts"),
  saveSparePartLogs: (u: string, v: any[]) => saveUserData(u, "ws_parts", v),
  loadBreakdowns: (u: string) => loadUserData(u, "ws_breakdowns"),
  saveBreakdowns: (u: string, v: any[]) => saveUserData(u, "ws_breakdowns", v),
  loadWarehouse: (u: string) => loadUserData(u, "ws_warehouse"),
  saveWarehouse: (u: string, v: any[]) => saveUserData(u, "ws_warehouse", v),
  loadPurchaseReqs: (u: string) => loadUserData(u, "ws_purchreq"),
  savePurchaseReqs: (u: string, v: any[]) => saveUserData(u, "ws_purchreq", v),
  loadStations: (u: string) => loadUserData(u, "ws_stations"),
  saveStations: (u: string, v: any[]) => saveUserData(u, "ws_stations", v),
  loadPeriodicMaints: (u: string) => loadUserData(u, "ws_maints"),
  savePeriodicMaints: (u: string, v: any[]) => saveUserData(u, "ws_maints", v),
  loadStnDailyChecks: (u: string) => loadUserData(u, "stn_daily"),
  saveStnDailyChecks: (u: string, v: any[]) => saveUserData(u, "stn_daily", v),
  loadStnSchedule: (u: string) => loadUserData(u, "stn_schedule"),
  saveStnSchedule: (u: string, v: any[]) => saveUserData(u, "stn_schedule", v),
  loadStnRequests: (u: string) => loadUserData(u, "stn_requests"),
  saveStnRequests: (u: string, v: any[]) => saveUserData(u, "stn_requests", v),
  loadDeliveries: (u: string) => loadUserData(u, "deliveries"),
  saveDeliveries: (u: string, v: any[]) => saveUserData(u, "deliveries", v),
  loadPlantProfile: (u: string) => loadUserData(u, "plantProfile"),
  savePlantProfile: (u: string, v: any) => saveUserData(u, "plantProfile", v),
  loadPlants: (u: string) => loadUserData(u, "plants"),
  savePlants: (u: string, v: any[]) => saveUserData(u, "plants", v),
  loadBlockPlants: (u: string) => loadUserData(u, "blockPlants"),
  saveBlockPlants: (u: string, v: any[]) => saveUserData(u, "blockPlants", v),
  loadPayments: (u: string) => loadUserData(u, "payments"),
  savePayments: (u: string, v: any[]) => saveUserData(u, "payments", v),
  loadPurchaseOrders: (u: string) => loadUserData(u, "purchaseOrders"),
  savePurchaseOrders: (u: string, v: any[]) => saveUserData(u, "purchaseOrders", v),
  loadWeighbridgeRecords: (u: string) => loadUserData(u, "weighbridgeRecords"),
  saveWeighbridgeRecords: (u: string, v: any[]) => saveUserData(u, "weighbridgeRecords", v),
  loadReturns: (u: string) => loadUserData(u, "returnedConcrete"),
  saveReturns: (u: string, v: any[]) => saveUserData(u, "returnedConcrete", v),
  loadRawStock: (u: string) => loadUserData(u, "rawStock"),
  saveRawStock: (u: string, v: any) => saveUserData(u, "rawStock", v),
  loadGpsConfig: (u: string) => loadUserData(u, "gpsConfig"),
  loadGpsHistory: (u: string) => loadUserData(u, "gpsHistory"),
  loadLivePositions: (u: string) => loadUserData(u, "livePositions"),
  // Reps manager — daily field tasks assigned to sales reps
  loadRepTasks: (u: string) => loadUserData(u, "rep_tasks"),
  saveRepTasks: (u: string, v: any[]) => saveUserData(u, "rep_tasks", v),
  // Reps manager — live rep positions with day trail (خط السير)
  loadRepPositions: (u: string) => loadUserData(u, "rep_positions"),
  saveRepPositions: (u: string, v: any[]) => saveUserData(u, "rep_positions", v),
  loadNotifications: (u: string) => loadUserData(u, "notifications"),
  saveNotifications: (u: string, v: any[]) => saveUserData(u, "notifications", v),
  addNotification: async (u: string, n: any): Promise<void> => {
    const list = (await loadUserData(u, "notifications")) || [];
    const entry = {
      ...n,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ts: new Date().toISOString(),
      read: false,
    };
    await saveUserData(u, "notifications", [entry, ...list].slice(0, 80));
  },

  // ─── Company app-tree accounts (admin module) ───
  loadCompanyTree: async (u: string) => {
    const doc = await fsGet(`companyTrees/${u.toLowerCase()}`);
    if (!doc) return null;
    return {
      companyUsername: doc.companyUsername ?? u.toLowerCase(),
      accounts: Array.isArray(doc.accounts) ? doc.accounts : [],
      subscriptionStart: doc.subscriptionStart ?? "",
      subscriptionEnd: doc.subscriptionEnd ?? "",
      subscriptionStatus: doc.subscriptionStatus ?? "",
    };
  },
  /** Company subscription fields only (from companyTrees doc). */
  loadCompanySubscription: async (u: string) => {
    try {
      const doc = await fsGet(`companyTrees/${u.toLowerCase()}`);
      if (!doc) return null;
      return {
        subscriptionStart: doc.subscriptionStart ?? "",
        subscriptionEnd: doc.subscriptionEnd ?? "",
        subscriptionStatus: doc.subscriptionStatus ?? "",
      };
    } catch {
      return null;
    }
  },
  saveCompanyTree: async (u: string, accounts: any[]): Promise<boolean> => {
    const uname = u.toLowerCase();
    await fsSet(`companyTrees/${uname}`, {
      fields: {
        companyUsername: { stringValue: uname },
        accounts: encode(accounts),
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    });
    return true;
  },
};
