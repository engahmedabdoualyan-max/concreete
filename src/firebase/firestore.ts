import { db } from './config';
import {
  doc, setDoc, getDoc, collection, getDocs, serverTimestamp,
} from 'firebase/firestore';

// ====================== Storage Quota ======================
export const DEFAULT_QUOTA_MB = 300;

export const USER_DATA_COLLECTIONS = [
  'trips', 'oeeLogs', 'recipes', 'calibrationLogs', 'inventory', 'deliveries',
  'productionRuns', 'qcRecords', 'assets', 'workshopConfig', 'customers', 'plantProfile',
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

export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map(d => d.data());
}

// ====================== User Data Helpers ======================
function userDoc(userId: string, collectionName: string) {
  return doc(db, 'userData', userId, collectionName, 'data');
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

  await setDoc(userDoc(userId, collectionName), { data, updatedAt: serverTimestamp() });
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
