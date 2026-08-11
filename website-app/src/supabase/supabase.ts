/**
 * ============================================================
 *  Legacy site tables merged into the UNIFIED PostgreSQL DB.
 *
 *  Previously backed by a third-party Supabase project
 *  (mxdirmrmfuycrbqvjrsb): plant_profiles, admin_users,
 *  gps_locations. Now stored in the main ERP database via the
 *  /api/workspace endpoints (tenant-scoped), so the site has a
 *  single data store. Function signatures are unchanged so no
 *  component code had to be touched.
 * ============================================================
 */

import { api, getToken } from '../api/client';

async function loadBlob<T>(collectionName: string): Promise<T | null> {
  if (!getToken()) return null;
  try {
    const res = await api.get<{ data: T | null }>(`/api/workspace/${collectionName}`);
    return res?.data ?? null;
  } catch {
    return null;
  }
}

async function saveBlob(collectionName: string, data: unknown): Promise<boolean> {
  if (!getToken()) return true; // offline: cache-only, mirrors firestore.ts
  try {
    await api.put(`/api/workspace/${collectionName}`, data ?? {});
    return true;
  } catch {
    return false;
  }
}

// ====================== Plant Profiles (admin) ======================
export interface PlantProfileRow {
  username: string;
  name: string;
  manager: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  license_number: string;
  capacity_m3: string;
  mixer_count: string;
  truck_count: string;
  founding_year: string;
  notes: string;
  gps_lat?: number;
  gps_lng?: number;
  gps_updated_at?: string;
  updated_at?: string;
}

const PLANT_COLLECTION = 'adminPlantProfile';

export async function savePlantProfileToSupabase(row: PlantProfileRow): Promise<boolean> {
  return saveBlob(PLANT_COLLECTION, { ...row, updated_at: new Date().toISOString() });
}

export async function loadPlantProfileFromSupabase(username: string): Promise<PlantProfileRow | null> {
  const blob = await loadBlob<PlantProfileRow | null>(PLANT_COLLECTION);
  if (!blob || blob.username !== username) return null;
  return blob;
}

// ====================== Admin / Managed Users ======================
export interface AdminUserRow {
  username: string;
  password: string;
  name: string;
  email: string;
  phone: string;
  plant_name: string;
  country: string;
  city: string;
  role: string;
  is_active: boolean;
  permissions?: Record<string, boolean>;
  updated_at?: string;
}

const USERS_COLLECTION = 'adminUsers';

export async function loadAdminUsersFromSupabase(): Promise<AdminUserRow[]> {
  const blob = await loadBlob<AdminUserRow[] | null>(USERS_COLLECTION);
  return Array.isArray(blob) ? blob : [];
}

export async function saveAdminUserToSupabase(row: AdminUserRow): Promise<boolean> {
  const users = await loadAdminUsersFromSupabase();
  const index = users.findIndex(u => u.username === row.username);
  const updated = { ...row, updated_at: new Date().toISOString() };
  if (index >= 0) users[index] = updated;
  else users.push(updated);
  return saveBlob(USERS_COLLECTION, users);
}

export async function deleteAdminUserFromSupabase(username: string): Promise<boolean> {
  const users = await loadAdminUsersFromSupabase();
  const remaining = users.filter(u => u.username !== username);
  if (remaining.length === users.length) return true;
  return saveBlob(USERS_COLLECTION, remaining);
}

// ====================== GPS locations (shared across sections) ======================
export interface GpsLocationRow {
  id?: string;
  username: string;
  label: string;
  lat: number;
  lng: number;
  updated_at?: string;
}

const GPS_COLLECTION = 'gpsLocations';

export async function loadGpsLocationsFromSupabase(): Promise<GpsLocationRow[]> {
  const blob = await loadBlob<GpsLocationRow[] | null>(GPS_COLLECTION);
  const rows = Array.isArray(blob) ? blob : [];
  return [...rows].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
}

export async function saveGpsLocationToSupabase(row: GpsLocationRow): Promise<boolean> {
  const rows = await loadGpsLocationsFromSupabase();
  const index = rows.findIndex(r => r.username === row.username && r.label === row.label);
  const updated = { ...row, id: row.id || `${row.username}:${row.label}`, updated_at: new Date().toISOString() };
  if (index >= 0) rows[index] = updated;
  else rows.push(updated);
  return saveBlob(GPS_COLLECTION, rows);
}
