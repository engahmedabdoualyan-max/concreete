import { db } from './config';
import {
  doc, setDoc, getDoc, collection, getDocs, serverTimestamp,
} from 'firebase/firestore';

// ====================== Users ======================
export async function saveUser(user: any) {
  await setDoc(doc(db, 'users', user.username.toLowerCase()), {
    ...user,
    username: user.username.toLowerCase(),
    createdAt: serverTimestamp(),
  });
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
  await setDoc(userDoc(userId, collectionName), { data, updatedAt: serverTimestamp() });
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
