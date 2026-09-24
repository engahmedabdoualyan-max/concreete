import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { VITE_SUPABASE_URL, VITE_SUPABASE_KEY } from './keys';

const url = (import.meta as any).env?.VITE_SUPABASE_URL || VITE_SUPABASE_URL;
const key = (import.meta as any).env?.VITE_SUPABASE_KEY || VITE_SUPABASE_KEY;

export const supabase: SupabaseClient = createClient(url, key);

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

export async function savePlantProfileToSupabase(row: PlantProfileRow): Promise<boolean> {
  try {
    const { error } = await supabase.from('plant_profiles').upsert(row, { onConflict: 'username' });
    return !error;
  } catch {
    return false;
  }
}

export async function loadPlantProfileFromSupabase(username: string): Promise<PlantProfileRow | null> {
  try {
    const { data, error } = await supabase.from('plant_profiles').select('*').eq('username', username).maybeSingle();
    if (error || !data) return null;
    return data as PlantProfileRow;
  } catch {
    return null;
  }
}

// ====================== Admin / Managed Users ======================
export interface AdminUserRow {
  username: string;
  password?: string;
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

export async function saveAdminUserToSupabase(row: AdminUserRow): Promise<boolean> {
  try {
    const { error } = await supabase.from('admin_users').upsert(row, { onConflict: 'username' });
    return !error;
  } catch {
    return false;
  }
}

export async function deleteAdminUserFromSupabase(username: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('admin_users').delete().eq('username', username);
    return !error;
  } catch {
    return false;
  }
}

export async function loadAdminUsersFromSupabase(): Promise<AdminUserRow[]> {
  try {
    const { data, error } = await supabase.from('admin_users').select('*');
    if (error || !data) return [];
    return data as AdminUserRow[];
  } catch {
    return [];
  }
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

export async function saveGpsLocationToSupabase(row: GpsLocationRow): Promise<boolean> {
  try {
    const { error } = await supabase.from('gps_locations').upsert({ ...row, username: row.username, label: row.label, lat: row.lat, lng: row.lng }, { onConflict: 'username,label' });
    return !error;
  } catch {
    return false;
  }
}

export async function loadGpsLocationsFromSupabase(): Promise<GpsLocationRow[]> {
  try {
    const { data, error } = await supabase.from('gps_locations').select('*').order('updated_at', { ascending: false });
    if (error || !data) return [];
    return data as GpsLocationRow[];
  } catch {
    return [];
  }
}
