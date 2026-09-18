import { db } from './config';
import {
  doc, setDoc, getDoc, collection, getDocs, serverTimestamp, deleteDoc, updateDoc,
} from 'firebase/firestore';

// ====================== Storage Quota ======================
export const DEFAULT_QUOTA_MB = 300;

export const USER_DATA_COLLECTIONS = [
  'trips', 'oeeLogs', 'recipes', 'calibrationLogs', 'inventory', 'deliveries',
  'productionRuns', 'qcRecords', 'assets', 'workshopConfig', 'customers', 'plantProfile',
  'weighbridgeRecords', 'returnedConcrete', 'payments', 'purchaseOrders', 'rawStock',
  'plants', 'blockPlants', 'gpsConfig', 'gpsHistory', 'livePositions',
  'orders', 'notifications', 'accountingSettings', 'batchController', 'dashcamConfig', 'devicesRegistry',
];

function userDocRef(userId: string) {
  return doc(db, 'users', userId);
}

// حساب الاستخدام الفعلي للمستخدم من كل مجموعات بياناته (بايت)
export async function computeUserStorageBytes(userId: string): Promise<number> {
  let total = 0;
  for (const name of USER_DATA_COLLECTIONS) {
    const snap = await getDoc(userDoc(userId, name));
    if (snap.exists()) {
      total += JSON.stringify(snap.data()).length;
    }
  }
  return total;
}

// تحديث حقل الاستخدام في مستند المستخدم بعد كل حفظ
export async function refreshStorageUsage(userId: string): Promise<void> {
  try {
    const used = await computeUserStorageBytes(userId);
    const userSnap = await getDoc(userDocRef(userId));
    const quota = userSnap.exists() ? (Number(userSnap.data()?.storageQuotaMB) || DEFAULT_QUOTA_MB) : DEFAULT_QUOTA_MB;
    await setDoc(userDocRef(userId), {
      storageUsedMB: parseFloat((used / (1024 * 1024)).toFixed(3)),
      storageUsedBytes: used,
      storageQuotaMB: quota,
      overQuota: used > quota * 1024 * 1024,
      lastUsageUpdate: serverTimestamp(),
    }, { merge: true });
  } catch { }
}

// الوضع الحالي لمساحة المستخدم
export async function getStorageStatus(username: string) {
  const snap = await getDoc(userDocRef(username.toLowerCase()));
  const quotaMB = snap.exists() ? (Number(snap.data()?.storageQuotaMB) || DEFAULT_QUOTA_MB) : DEFAULT_QUOTA_MB;
  let usedMB = snap.exists() ? Number(snap.data()?.storageUsedMB) || 0 : 0;
  if (snap.exists() && !snap.data()?.storageUsedMB) {
    await refreshStorageUsage(username.toLowerCase());
    usedMB = await computeUserStorageBytes(username.toLowerCase()) / (1024 * 1024);
  }
  const usedBytes = usedMB * 1024 * 1024;
  return {
    quotaMB,
    usedMB: parseFloat(usedMB.toFixed(3)),
    remainingMB: Math.max(0, parseFloat((quotaMB - usedMB).toFixed(3))),
    pct: quotaMB > 0 ? Math.min(100, (usedMB / quotaMB) * 100) : 0,
    overQuota: usedBytes > quotaMB * 1024 * 1024,
  };
}

// ====================== Users ======================
export async function saveUser(user: any) {
  const userId = user.username.toLowerCase();
  await setDoc(doc(db, 'users', userId), {
    ...user,
    username: userId,
    storageQuotaMB: DEFAULT_QUOTA_MB,
    storageUsedMB: 0,
    storageUsedBytes: 0,
    overQuota: false,
    createdAt: serverTimestamp(),
  }, { merge: true });
}

export async function getUser(username: string) {
  const snap = await getDoc(doc(db, 'users', username.toLowerCase()));
  return snap.exists() ? snap.data() : null;
}

// ====================== Company App-Tree (app login accounts) ======================
export interface AppAccount {
  email: string;
  password: string;
  role: string;
  roleAr: string;
  permissions: string[];
  mods?: string[];
  phone?: string;
  truck?: string;
  gps?: string;
}

export interface CompanyTree {
  companyUsername: string;
  accounts: AppAccount[];
  /** Subscription dates — set by the Console; the mobile app locks accounts when expired. */
  subscriptionStart?: string;
  subscriptionEnd?: string;
  subscriptionStatus?: string;
}

export async function saveCompanyTree(tree: CompanyTree): Promise<void> {
  await setDoc(doc(db, 'companyTrees', tree.companyUsername.toLowerCase()), {
    ...tree,
    companyUsername: tree.companyUsername.toLowerCase(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadCompanyTree(username: string): Promise<CompanyTree | null> {
  const snap = await getDoc(doc(db, 'companyTrees', username.toLowerCase()));
  return snap.exists() ? snap.data() as CompanyTree : null;
}

/** Persist company subscription dates + status on the companyTrees doc (read by the mobile app). */
export async function saveCompanySubscription(username: string, sub: { subscriptionStart?: string; subscriptionEnd?: string; subscriptionStatus?: string }): Promise<void> {
  await setDoc(doc(db, 'companyTrees', username.toLowerCase()), {
    ...sub,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Delete a company: its app-tree, its account doc, AND every tree account doc
 *  that lives in the shared `users` collection (otherwise deleted-company
 *  accounts could still log in and see orphaned data). */
export async function deleteCompany(username: string): Promise<void> {
  const uname = username.toLowerCase();
  try {
    const tree = await loadCompanyTree(uname);
    if (tree?.accounts?.length) {
      for (const a of tree.accounts) {
        const accUname = String(a.email || '').trim().toLowerCase();
        if (accUname) {
          try { await deleteDoc(doc(db, 'users', accUname)); } catch {}
        }
      }
    }
  } catch {}
  await deleteDoc(doc(db, 'companyTrees', uname));
  await deleteDoc(doc(db, 'users', uname));
}

/** Every company tree (used for cross-company uniqueness checks). */
export async function getAllCompanyTrees(): Promise<CompanyTree[]> {
  const snap = await getDocs(collection(db, 'companyTrees'));
  return snap.docs.map(d => d.data() as CompanyTree);
}

/** Delete a single app-tree account from the shared `users` collection. */
export async function deleteAppAccount(username: string): Promise<void> {
  const accUname = String(username || '').trim().toLowerCase();
  if (!accUname) return;
  await deleteDoc(doc(db, 'users', accUname));
}

// App login account — registered in the shared `users` collection so mobile/web login works
export interface AppAccountUser {
  username: string;
  password: string;
  passwordHash?: string;
  plantName: string;
  country?: string;
  city?: string;
  phone?: string;
  email: string;
  status: string;
  role: string;
  roleAr: string;
  permissions?: string[];
  mods?: string[];
  truck?: string;
  gps?: string;
}

export async function saveAppAccount(user: AppAccountUser): Promise<void> {
  const docId = user.username.toLowerCase();
  await setDoc(doc(db, 'users', docId), {
    username: docId,
    password: user.password || '',
    passwordHash: user.passwordHash || '',
    plantName: user.plantName,
    country: user.country || '',
    city: user.city || '',
    phone: user.phone || '',
    email: user.email,
    status: user.status,
    role: user.role,
    roleAr: user.roleAr,
    permissions: user.permissions || [],
    mods: user.mods || [],
    truck: user.truck || '',
    gps: user.gps || '',
    storageQuotaMB: DEFAULT_QUOTA_MB,
    storageUsedMB: 0,
    storageUsedBytes: 0,
    overQuota: false,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// ====================== Presence (online status) ======================
// Every open tab pings `users/<username>/lastSeenAt` every heartbeat. An
// account is considered "online" if lastSeenAt is within the ONLINE_WINDOW_MS.
export const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export async function reportPresence(username: string): Promise<void> {
  const uname = String(username || '').trim().toLowerCase();
  if (!uname) return;
  try {
    await setDoc(doc(db, 'users', uname), { lastSeenAt: Date.now() }, { merge: true });
  } catch {}
}

export async function clearPresence(username: string): Promise<void> {
  const uname = String(username || '').trim().toLowerCase();
  if (!uname) return;
  try {
    await setDoc(doc(db, 'users', uname), { lastSeenAt: 0 }, { merge: true });
  } catch {}
}

export function isOnline(lastSeenAt?: number | null, now: number = Date.now()): boolean {
  return typeof lastSeenAt === 'number' && lastSeenAt > 0 && now - lastSeenAt <= ONLINE_WINDOW_MS;
}

// ====================== Image Upload ======================
// Images are compressed client-side and stored as Firestore docs (`media/{id}`),
// because this project's Firebase billing cannot create a Storage bucket and
// base64-in-localStorage exceeds the 5MB quota. The config keeps only a tiny
// `dbimg://{id}` reference which the app resolves on load.

const DBIMG_PREFIX = 'dbimg://';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not supported');
        ctx.drawImage(img, 0, 0, w, h);
        const isPng = /\.png$|image\/png/i.test(file.type) || file.name.toLowerCase().endsWith('.png');
        resolve(isPng
          ? (canvas.toDataURL('image/png') as string)
          : (canvas.toDataURL('image/jpeg', quality) as string));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Compression failed'));
      }
    };
    img.onerror = () => reject(new Error('Unsupported image file'));
    img.src = dataUrl;
  });
}

const MEDIA_CACHE_KEY = 'fimto_media_cache';

export async function uploadConsoleImage(file: File, folder?: string): Promise<string> {
  const MAX = 20 * 1024 * 1024;
  if (!file.type.startsWith('image/') && !/\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)) {
    throw new Error('الملف مش صورة');
  }
  if (file.size > MAX) throw new Error('حجم الصورة كبير جداً (الحد 20MB)');
  const isBg = /bgImage|background/i.test(folder || '');
  const dataUrl = await compressImage(file, isBg ? 1400 : 512, 0.75);
  if (dataUrl.length > 950_000) throw new Error('الصورة كبيرة جداً بعد الضغط — اختار صورة أصغر');
  const id = `${(folder || 'general').replace(/[^a-z0-9_-]/gi, '-').slice(0, 40)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await setDoc(doc(db, 'media', id), { dataUrl, ts: serverTimestamp() });
  return `${DBIMG_PREFIX}${id}`;
}

export function isDbImageRef(v: string): boolean {
  return typeof v === 'string' && v.startsWith(DBIMG_PREFIX);
}

// Resolve a `dbimg://id` reference to its data URL (cached in localStorage).
export async function resolveDbImage(ref: string): Promise<string> {
  const id = ref.slice(DBIMG_PREFIX.length);
  try {
    const cache = JSON.parse(localStorage.getItem(MEDIA_CACHE_KEY) || '{}');
    if (cache[id]) return cache[id];
  } catch { }
  const snap = await getDoc(doc(db, 'media', id));
  if (!snap.exists()) return '';
  const dataUrl = snap.data()?.dataUrl || '';
  if (dataUrl) {
    try {
      const cache = JSON.parse(localStorage.getItem(MEDIA_CACHE_KEY) || '{}');
      cache[id] = dataUrl;
      const keys = Object.keys(cache);
      if (keys.length > 60) {
        // keep the cache under ~4MB: drop oldest entries on insert
        let total = JSON.stringify(cache).length;
        while (total > 4 * 1024 * 1024 && keys.length) {
          const oldest = keys.shift() as string;
          total -= (cache[oldest]?.length || 0) + oldest.length + 4;
          delete cache[oldest];
        }
      }
      localStorage.setItem(MEDIA_CACHE_KEY, JSON.stringify(cache));
    } catch { }
  }
  return dataUrl;
}

// ====================== Site-wide configuration (section images) ======================
export interface SiteConfig {
  overrides: Record<string, { image?: string; bgImage?: string }>;
  custom: any[];
}

export async function saveSiteConfig(cfg: SiteConfig): Promise<void> {
  await setDoc(doc(db, 'siteConfig', 'main'), { overrides: cfg.overrides, custom: cfg.custom, updatedAt: serverTimestamp() }, { merge: true });
}

export async function loadSiteConfig(): Promise<SiteConfig | null> {
  const snap = await getDoc(doc(db, 'siteConfig', 'main'));
  return snap.exists() ? snap.data() as SiteConfig : null;
}

export interface EffectiveConfig {
  overrides: Record<string, { image?: string; bgImage?: string }>;
  custom: any[];
}

// Load the DB site config and merge it into localStorage so the running app
// (Dashboard, CustomSection) picks up the console admin's uploads immediately.
// `dbimg://id` image refs are resolved to cached data URLs.
export async function loadEffectiveConfig(): Promise<EffectiveConfig> {
  const LOCAL_KEY = 'fimto_module_config';
  const local: EffectiveConfig = { overrides: {}, custom: [] };
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      const cfg = JSON.parse(raw);
      local.overrides = cfg.overrides || {};
      local.custom = Array.isArray(cfg.custom) ? cfg.custom : [];
    }
  } catch { }
  let dbCfg: SiteConfig | null = null;
  try { dbCfg = await loadSiteConfig(); } catch (err) { console.error('load db cfg', err); }
  if (dbCfg && (Object.keys(dbCfg.overrides || {}).length || (dbCfg.custom || []).length)) {
    local.overrides = { ...(dbCfg.overrides || {}) };
    local.custom = dbCfg.custom || [];
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(local)); } catch { }
  }
  // resolve dbimg refs (cached)
  const want = new Set<string>();
  for (const o of Object.values(local.overrides)) {
    if (o?.image && isDbImageRef(o.image)) want.add(o.image);
    if (o?.bgImage && isDbImageRef(o.bgImage)) want.add(o.bgImage);
  }
  for (const c of local.custom) {
    if (c?.image && isDbImageRef(c.image)) want.add(c.image);
    if (c?.bgImage && isDbImageRef(c.bgImage)) want.add(c.bgImage);
  }
  if (want.size) {
    await Promise.all(Array.from(want).map(async (ref) => {
      const dataUrl = await resolveDbImage(ref).catch(() => '');
      if (dataUrl) {
        for (const o of Object.values(local.overrides)) {
          if (o?.image === ref) o.image = dataUrl;
          if (o?.bgImage === ref) o.bgImage = dataUrl;
        }
        for (const c of local.custom) {
          if (c?.image === ref) c.image = dataUrl;
          if (c?.bgImage === ref) c.bgImage = dataUrl;
        }
      }
    }));
  }
  return local;
}

export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => d.data());
}

// ====================== Uniqueness (cross-company) ======================
/**
 * Verify that a username and a password are globally unique across ALL
 * companies + ALL tree accounts. This is the guard that prevents two
 * companies from ever sharing a login that could mix their data.
 *
 * Returns a list of human-readable conflict messages (empty = safe to save).
 */
export async function checkLoginUniqueness(
  username: string,
  password: string,
  opts: { selfUname?: string } = {},
): Promise<string[]> {
  const problems: string[] = [];
  const wantUname = String(username || '').trim().toLowerCase();
  const wantPass = String(password || '');
  const selfUname = String(opts.selfUname || '').trim().toLowerCase();

  if (!wantUname || !wantPass) return problems;

  // 1) Direct username collision on a users doc (company OR app account).
  try {
    const snap = await getDoc(doc(db, 'users', wantUname));
    const ownerUname = snap.exists() ? String(snap.data()?.username || wantUname).toLowerCase() : '';
    if (snap.exists() && ownerUname !== selfUname) {
      problems.push(`الاسم "${wantUname}" مستخدم من قبل حساب آخر في الداتابيز`);
    }
  } catch {}

  // 2) Scan every tree account across every company for username + password.
  try {
    const trees = await getAllCompanyTrees();
    for (const t of trees) {
      const compUname = String(t.companyUsername || '').toLowerCase();
      if (compUname === selfUname) continue;
      for (const a of t.accounts || []) {
        const accUname = String(a.email || '').trim().toLowerCase();
        const accPass = String(a.password || '');
        if (accUname === wantUname) {
          problems.push(`الاسم "${wantUname}" مستخدم في شجرة شركة "${t.companyUsername}"`);
        }
        if (accPass && accPass === wantPass) {
          problems.push(`الباسورد مستخدم في حساب "${accUname}" بشركة "${t.companyUsername}" — غيّره`);
        }
      }
    }
  } catch {}

  return problems;
}

/**
 * Cross-company uniqueness check for a batch of tree accounts before saving.
 * Guards both the username (email) and the password so no two accounts can
 * ever share a login that would mix two companies' data.
 */
export async function checkTreeAccountConflicts(
  accounts: { email?: string; password?: string }[],
  companyUname: string,
): Promise<string[]> {
  const problems: string[] = [];
  const self = String(companyUname || '').toLowerCase();
  const rows = accounts || [];

  let allUsers: any[] = [];
  let trees: CompanyTree[] = [];
  try { allUsers = await getAllUsers(); } catch {}
  try { trees = await getAllCompanyTrees(); } catch {}

  // Owner usernames + passwords of OTHER companies (a tree account must not
  // collide with another company's owner account).
  // NOTE: this company's OWN tree accounts are also stored in the shared
  // `users` collection (saveAppAccount), so they are excluded from the scan —
  // otherwise re-saving the same tree would flag its own previously-registered
  // accounts as "used by another company".
  const ownerNames = new Set<string>();
  const ownerPasswords = new Set<string>();
  const selfTreeEmails = new Set<string>();
  const selfTreePasswords = new Set<string>();
  for (const t of trees) {
    const comp = String(t.companyUsername || '').toLowerCase();
    if (comp !== self) continue;
    for (const a of t.accounts || []) {
      const em = String(a.email || '').trim().toLowerCase();
      const pw = String(a.password || '');
      if (em) selfTreeEmails.add(em);
      if (pw) selfTreePasswords.add(pw);
    }
  }
  for (const u of allUsers) {
    const un = String(u?.username || u?.id || '').toLowerCase();
    if (!un || un === self) continue;
    if (selfTreeEmails.has(un)) continue;
    ownerNames.add(un);
    const pw = String(u?.password || '');
    if (pw && !selfTreePasswords.has(pw)) ownerPasswords.add(pw);
  }

  // Email + password index of tree accounts in OTHER companies only.
  const usedEmails = new Set<string>();
  const usedPasswords = new Set<string>();
  for (const t of trees) {
    const comp = String(t.companyUsername || '').toLowerCase();
    if (comp === self) continue;
    for (const a of t.accounts || []) {
      const em = String(a.email || '').trim().toLowerCase();
      const pw = String(a.password || '');
      if (em) usedEmails.add(em);
      if (pw) usedPasswords.add(pw);
    }
  }

  // Within this batch (same company) every account must be unique too.
  const batchEmails = new Set<string>();
  const batchPasswords = new Set<string>();

  for (const a of rows) {
    const em = String(a.email || '').trim().toLowerCase();
    const pw = String(a.password || '');
    if (!em) { problems.push('حساب بدون ايميل — املأ البريد'); continue; }
    if (ownerNames.has(em)) problems.push(`الاسم "${em}" مستخدم كحساب شركة أخرى`);
    if (usedEmails.has(em)) problems.push(`الاسم "${em}" مستخدم في شجرة شركة أخرى`);
    if (batchEmails.has(em)) problems.push(`الاسم "${em}" مكرر داخل نفس الشجرة`);
    batchEmails.add(em);
    if (!pw) { problems.push(`حساب "${em}" بدون باسورد`); continue; }
    if (ownerPasswords.has(pw)) problems.push(`باسورد "${em}" مطابق لباسورد شركة أخرى`);
    if (usedPasswords.has(pw)) problems.push(`باسورد "${em}" مطابق لباسورد حساب في شركة أخرى`);
    if (batchPasswords.has(pw)) problems.push(`باسورد "${em}" مكرر داخل نفس الشجرة`);
    batchPasswords.add(pw);
  }

  return problems;
}

// ====================== User Data Helpers ======================
function userDoc(userId: string, collectionName: string) {
  return doc(db, 'userData', userId, collectionName, 'data');
}

function cleanForFirestore(v: any): any {
  if (Array.isArray(v)) return v.map(cleanForFirestore);
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = cleanForFirestore(v[k]);
    return o;
  }
  return v;
}

async function saveUserData(userId: string, collectionName: string, data: any) {
  const userSnap = await getDoc(userDocRef(userId));
  const quotaMB = userSnap.exists() ? (Number(userSnap.data()?.storageQuotaMB) || DEFAULT_QUOTA_MB) : DEFAULT_QUOTA_MB;
  const usedBytes = userSnap.exists() ? Number(userSnap.data()?.storageUsedBytes) || 0 : 0;
  const quotaBytes = quotaMB * 1024 * 1024;

  const prevSnap = await getDoc(userDoc(userId, collectionName));
  const oldLen = prevSnap.exists() ? JSON.stringify(prevSnap.data()).length : 0;
  const newLen = JSON.stringify({ data, updatedAt: new Date().toISOString() }).length;
  const projected = usedBytes + newLen - oldLen;

  if (projected > quotaBytes) {
    await setDoc(userDocRef(userId), {
      storageUsedMB: parseFloat((usedBytes / (1024 * 1024)).toFixed(3)),
      storageUsedBytes: usedBytes,
      storageQuotaMB: quotaMB,
      overQuota: true,
      lastUsageUpdate: serverTimestamp(),
    }, { merge: true });
    try { localStorage.setItem('concrete_quota_over', '1'); } catch { }
    return false;
  }

  // Merge=true so the server-stamped `orderTimes` audit map written by the
  // mobile app is preserved when the website rewrites an orders doc.
  await setDoc(userDoc(userId, collectionName), { data: cleanForFirestore(data), updatedAt: serverTimestamp() }, { merge: true });
  refreshStorageUsage(userId);
  try { localStorage.removeItem('concrete_quota_over'); } catch { }
  return true;
}

async function loadUserData(userId: string, collectionName: string) {
  const snap = await getDoc(userDoc(userId, collectionName));
  return snap.exists() ? snap.data()?.data ?? null : null;
}

// ====================== Trips (Operations) ======================
export async function saveTrips(userId: string, trips: any[]) {
  await saveUserData(userId, 'trips', trips);
}
export async function loadTrips(userId: string) {
  return await loadUserData(userId, 'trips');
}

// ====================== OEE Logs (Evaluation) ======================
export async function saveOEELogs(userId: string, logs: any[]) {
  await saveUserData(userId, 'oeeLogs', logs);
}
export async function loadOEELogs(userId: string) {
  return await loadUserData(userId, 'oeeLogs');
}

// ====================== Recipes (Mixing) ======================
export async function saveRecipes(userId: string, recipes: any[]) {
  await saveUserData(userId, 'recipes', recipes);
}
export async function loadRecipes(userId: string) {
  return await loadUserData(userId, 'recipes');
}

// ====================== Calibration Logs ======================
export async function saveCalibrationLogs(userId: string, logs: any[]) {
  await saveUserData(userId, 'calibrationLogs', logs);
}
export async function loadCalibrationLogs(userId: string) {
  return await loadUserData(userId, 'calibrationLogs');
}

// ====================== Inventory ======================
export async function saveInventory(userId: string, inventory: any) {
  await saveUserData(userId, 'inventory', inventory);
}
export async function loadInventory(userId: string) {
  return await loadUserData(userId, 'inventory');
}

// ====================== Deliveries ======================
export async function saveDeliveries(userId: string, deliveries: any[]) {
  await saveUserData(userId, 'deliveries', deliveries);
}
export async function loadDeliveries(userId: string) {
  return await loadUserData(userId, 'deliveries');
}

// ====================== Production Runs ======================
export async function saveProductionRuns(userId: string, runs: any[]) {
  await saveUserData(userId, 'productionRuns', runs);
}
export async function loadProductionRuns(userId: string) {
  return await loadUserData(userId, 'productionRuns');
}

// ====================== QC Records ======================
export async function saveQCRecords(userId: string, records: any[]) {
  await saveUserData(userId, 'qcRecords', records);
}
export async function loadQCRecords(userId: string) {
  return await loadUserData(userId, 'qcRecords');
}

// ====================== Assets (Workshop) ======================
export async function saveAssets(userId: string, assets: any[]) {
  await saveUserData(userId, 'assets', assets);
}
export async function loadAssets(userId: string) {
  return await loadUserData(userId, 'assets');
}

// ====================== Workshop Config ======================
export async function saveWorkshopConfig(userId: string, config: any) {
  await saveUserData(userId, 'workshopConfig', config);
}
export async function loadWorkshopConfig(userId: string) {
  return await loadUserData(userId, 'workshopConfig');
}

// ====================== Workshop collections (ws_*) ======================
export async function saveFuelLogs(userId: string, v: any[]) { await saveUserData(userId, 'ws_fuel', v); }
export async function loadFuelLogs(userId: string) { return await loadUserData(userId, 'ws_fuel'); }
export async function saveOilLogs(userId: string, v: any[]) { await saveUserData(userId, 'ws_oil', v); }
export async function loadOilLogs(userId: string) { return await loadUserData(userId, 'ws_oil'); }
export async function saveSparePartLogs(userId: string, v: any[]) { await saveUserData(userId, 'ws_parts', v); }
export async function loadSparePartLogs(userId: string) { return await loadUserData(userId, 'ws_parts'); }
export async function saveBreakdowns(userId: string, v: any[]) { await saveUserData(userId, 'ws_breakdowns', v); }
export async function loadBreakdowns(userId: string) { return await loadUserData(userId, 'ws_breakdowns'); }
export async function saveWarehouse(userId: string, v: any[]) { await saveUserData(userId, 'ws_warehouse', v); }
export async function loadWarehouse(userId: string) { return await loadUserData(userId, 'ws_warehouse'); }
export async function savePurchaseReqs(userId: string, v: any[]) { await saveUserData(userId, 'ws_purchreq', v); }
export async function loadPurchaseReqs(userId: string) { return await loadUserData(userId, 'ws_purchreq'); }
export async function saveStations(userId: string, v: any[]) { await saveUserData(userId, 'ws_stations', v); }
export async function loadStations(userId: string) { return await loadUserData(userId, 'ws_stations'); }
export async function savePeriodicMaints(userId: string, v: any[]) { await saveUserData(userId, 'ws_maints', v); }
export async function loadPeriodicMaints(userId: string) { return await loadUserData(userId, 'ws_maints'); }


// ====================== Customer Database (Schedule) ======================
export async function saveCustomers(userId: string, customers: any[]) {
  await saveUserData(userId, 'customers', customers);
}
export async function loadCustomers(userId: string) {
  return await loadUserData(userId, 'customers');
}

// ====================== Plant Profile ======================
export async function savePlantProfile(userId: string, profile: any) {
  await saveUserData(userId, 'plantProfile', profile);
}
export async function loadPlantProfile(userId: string) {
  const snap = await getDoc(userDoc(userId, 'plantProfile'));
  return snap.exists() ? snap.data()?.data ?? { name: '', logo: '' } : { name: '', logo: '' };
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
export async function saveGpsConfig(userId: string, cfg: any) {
  await saveUserData(userId, 'gpsConfig', cfg);
}
export async function loadGpsConfig(userId: string) {
  return await loadUserData(userId, 'gpsConfig');
}

// ====================== GPS Route History ======================
export async function saveGpsHistory(userId: string, entry: { vehicle: string; date: string; points: Array<[number, number]> }) {
  const list = (await loadUserData(userId, 'gpsHistory')) || [];
  const filtered = list.filter((e: any) => !(e.vehicle === entry.vehicle && e.date === entry.date));
  await saveUserData(userId, 'gpsHistory', [...filtered, entry]);
}
export async function loadGpsHistory(userId: string) {
  return await loadUserData(userId, 'gpsHistory');
}

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
  const usersSnap = await getDocs(collection(db, 'users'));
  const out: Array<LivePosEntry & { username: string; plantName: string }> = [];
  for (const u of usersSnap.docs) {
    const data = u.data();
    const username = String(u.id);
    const live = await loadUserData(username, 'livePositions');
    if (Array.isArray(live)) live.forEach((e: LivePosEntry) => out.push({ ...e, username, plantName: data?.plantName || data?.name || username }));
  }
  return out;
}

// ====================== Plants (multi-site) ======================
export async function savePlants(userId: string, plants: any[]) {
  await saveUserData(userId, 'plants', plants);
}
export async function loadPlants(userId: string) {
  return await loadUserData(userId, 'plants');
}

// ====================== Block Factories (block production lines) ======================
export async function saveBlockPlants(userId: string, blockPlants: any[]) {
  await saveUserData(userId, 'blockPlants', blockPlants);
}
export async function loadBlockPlants(userId: string) {
  return await loadUserData(userId, 'blockPlants');
}

// ====================== Shared GPS (plant location) ======================
// يُحفظ في plantProfile ويقرأه كل الأقسام (Operations, Maps, Admin)
export async function savePlantGPS(userId: string, lat: number, lng: number) {
  const prev = await loadPlantProfile(userId);
  await savePlantProfile(userId, {
    ...prev,
    gpsLat: lat,
    gpsLng: lng,
    gpsUpdatedAt: new Date().toISOString(),
  });
}
export async function loadPlantGPS(userId: string): Promise<{ lat: number; lng: number } | null> {
  const profile = await loadPlantProfile(userId);
  if (profile && typeof profile.gpsLat === 'number' && typeof profile.gpsLng === 'number') {
    return { lat: profile.gpsLat, lng: profile.gpsLng };
  }
  return null;
}

// ====================== Weighbridge (Governance) ======================
export async function saveWeighbridgeRecords(userId: string, records: any[]) {
  await saveUserData(userId, 'weighbridgeRecords', records);
}
export async function loadWeighbridgeRecords(userId: string) {
  return await loadUserData(userId, 'weighbridgeRecords');
}

// ====================== Returned Concrete (Governance) ======================
export async function saveReturns(userId: string, records: any[]) {
  await saveUserData(userId, 'returnedConcrete', records);
}
export async function loadReturns(userId: string) {
  return await loadUserData(userId, 'returnedConcrete');
}

// ====================== Payments (Finance) ======================
export async function savePayments(userId: string, records: any[]) {
  await saveUserData(userId, 'payments', records);
}
export async function loadPayments(userId: string) {
  return await loadUserData(userId, 'payments');
}

// ====================== Purchase Orders (Finance) ======================
export async function savePurchaseOrders(userId: string, records: any[]) {
  await saveUserData(userId, 'purchaseOrders', records);
}
export async function loadPurchaseOrders(userId: string) {
  return await loadUserData(userId, 'purchaseOrders');
}

// ====================== Raw Material Stock (Reorder) ======================
export async function saveRawStock(userId: string, stock: any) {
  await saveUserData(userId, 'rawStock', stock);
}
export async function loadRawStock(userId: string) {
  return await loadUserData(userId, 'rawStock');
}

// ====================== R&D (Research & Development) ======================
export async function saveRnDData(userId: string, data: { projects: any[]; innovations: any[]; trainings: any[] }) {
  await saveUserData(userId, 'rndData', data);
}
export async function loadRnDData(userId: string) {
  return await loadUserData(userId, 'rndData');
}

// ====================== Additives (Production) ======================
export async function saveAdditives(userId: string, additives: any[]) {
  await saveUserData(userId, 'additives', additives);
}
export async function loadAdditives(userId: string) {
  return await loadUserData(userId, 'additives');
}

// ====================== Orders (Orders page) ======================
export async function saveOrders(userId: string, records: any[]) {
  await saveUserData(userId, 'orders', records);
}
export async function loadOrders(userId: string) {
  const snap = await getDoc(userDoc(userId, 'orders'));
  if (!snap.exists()) return null;
  const doc = snap.data();
  const list = Array.isArray(doc?.data) ? doc.data : null;
  if (!list) return list;
  const times = doc?.orderTimes && typeof doc.orderTimes === 'object' ? doc.orderTimes : {};
  // Merge the server-stamped audit map into each order so the UI can show it.
  return list.map((o: any) => {
    const t = o && o.id ? (times as any)[o.id] : null;
    if (!t || typeof t !== 'object') return o;
    return {
      ...o,
      serverCreatedAt: t.createdAt ?? o.serverCreatedAt,
      serverApprovedAt: t.approvedAt ?? o.serverApprovedAt,
      serverUpdatedAt: t.updatedAt ?? o.serverUpdatedAt,
    };
  });
}

/**
 * Server-stamp an audit timestamp for an order. Writes to the same
 * `orderTimes.{orderId}.{field}` map the mobile app uses, via the Firestore
 * SDK `serverTimestamp()` sentinel — the timestamp is set by the server.
 */
export async function stampOrderTime(userId: string, orderId: string, field: 'createdAt' | 'approvedAt' | 'updatedAt') {
  try {
    const key = `orderTimes.${orderId}.${field}`;
    await updateDoc(userDoc(userId, 'orders'), {
      [key]: serverTimestamp(),
    } as any);
  } catch (err) {
    console.warn('[stampOrderTime] failed', err);
  }
}

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
  try {
    const { notifyBrowser } = await import('../lib/notify');
    notifyBrowser(n.title, n.body);
  } catch {}
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
  const usersSnap = await getDocs(collection(db, 'users'));
  const out: PlantSummary[] = [];
  for (const u of usersSnap.docs) {
    const data = u.data();
    const username = String(u.id);
    const [trips, inventory, qc, orders, payments, pos] = await Promise.all([
      loadUserData(username, 'trips'),
      loadUserData(username, 'inventory'),
      loadUserData(username, 'qcRecords'),
      loadUserData(username, 'orders'),
      loadUserData(username, 'payments'),
      loadUserData(username, 'purchaseOrders'),
    ]);
    out.push({
      username,
      plantName: data?.plantName || data?.name || username,
      country: data?.country || '—',
      city: data?.city || '—',
      trips: Array.isArray(trips) ? trips.length : 0,
      tripList: Array.isArray(trips) ? trips : [],
      totalVolume: Array.isArray(trips) ? trips.reduce((s: number, t: any) => s + (Number(t.qty) || 0), 0) : 0,
      inventory: inventory && typeof inventory === 'object' ? inventory : {},
      qcCount: Array.isArray(qc) ? qc.length : 0,
      orders: Array.isArray(orders) ? orders : [],
      payments: Array.isArray(payments) ? payments : [],
      pos: Array.isArray(pos) ? pos : [],
    });
  }
  return out;
}

/* ──────────────── Customer Portal (search across all companies) ──────────────── */

/**
 * Search all companies' orders for a given customer phone or invoice/order number.
 * Returns matching orders across all plants.
 */
export async function loadAllOrdersForCustomer(identifier: string): Promise<any[]> {
  const q = identifier.trim().toLowerCase();
  const usersSnap = await getDocs(collection(db, 'users'));
  const results: any[] = [];

  for (const userDoc of usersSnap.docs) {
    const ordersSnap = await getDoc(doc(db, 'userData', userDoc.id, 'orders', 'data'));
    if (!ordersSnap.exists()) continue;
    const data = ordersSnap.data();
    const list = Array.isArray(data?.data) ? data.data : [];
    for (const order of list) {
      const phone = String(order.customerPhone || '').toLowerCase();
      const orderNo = String(order.orderNo || '').toLowerCase();
      const invoiceNo = String(order.invoiceNo || '').toLowerCase();
      if (phone.includes(q) || orderNo.includes(q) || invoiceNo.includes(q)) {
        results.push({ ...order, _plant: userDoc.id });
      }
    }
  }
  return results;
}

/**
 * Search all companies' payments for a given customer phone or invoice/order number.
 * Returns matching payments across all plants.
 */
export async function loadAllInvoicesForCustomer(identifier: string): Promise<any[]> {
  const q = identifier.trim().toLowerCase();
  const usersSnap = await getDocs(collection(db, 'users'));
  const results: any[] = [];

  for (const userDoc of usersSnap.docs) {
    const paymentsSnap = await getDoc(doc(db, 'userData', userDoc.id, 'payments', 'data'));
    if (!paymentsSnap.exists()) continue;
    const data = paymentsSnap.data();
    const list = Array.isArray(data?.data) ? data.data : [];
    for (const payment of list) {
      const phone = String(payment.customerPhone || '').toLowerCase();
      const orderNo = String(payment.orderNo || '').toLowerCase();
      const invoiceNo = String(payment.invoiceNo || '').toLowerCase();
      if (phone.includes(q) || orderNo.includes(q) || invoiceNo.includes(q)) {
        results.push({ ...payment, _plant: userDoc.id });
      }
    }
  }
  return results;
}

// ====================== Accounting Settings ======================
export async function saveAccountingSettings(userId: string, settings: any) {
  await saveUserData(userId, 'accountingSettings', settings);
}
export async function loadAccountingSettings(userId: string) {
  return await loadUserData(userId, 'accountingSettings');
}

// ====================== Batch Controller Config ======================
export async function saveBatchControllerConfig(userId: string, config: any) {
  await saveUserData(userId, 'batchController', config);
}
export async function loadBatchControllerConfig(userId: string) {
  return await loadUserData(userId, 'batchController');
}

// ====================== Dashcam Config ======================
export async function saveDashcamConfig(userId: string, config: any) {
  await saveUserData(userId, 'dashcamConfig', config);
}
export async function loadDashcamConfig(userId: string) {
  return await loadUserData(userId, 'dashcamConfig');
}

// ====================== Peripheral Devices Registry ======================
export interface DeviceEntry {
  id: string;                 // 'batchController' | 'dashcam' | 'accounting' | 'gpsTrackers' | 'weighbridge'
  name: string;
  connected: boolean;
  model?: string;
  lastCheckedAt?: string;
  meta?: Record<string, any>;
}
export async function saveDevicesRegistry(userId: string, devices: DeviceEntry[]) {
  await saveUserData(userId, 'devicesRegistry', devices);
}
export async function loadDevicesRegistry(userId: string): Promise<DeviceEntry[] | null> {
  return await loadUserData(userId, 'devicesRegistry');
}
