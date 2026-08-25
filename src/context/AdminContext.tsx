import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  savePlantProfileToSupabase, loadPlantProfileFromSupabase,
  saveAdminUserToSupabase, deleteAdminUserFromSupabase, loadAdminUsersFromSupabase,
} from '../supabase/supabase';
import { treeModsForRole } from '../lib/treeRoles';

export type UserRole = 'owner' | 'manager' | 'operator' | 'quality' | 'maintenance' | 'viewer' | 'sysadmin' | 'ptown';
export type ModuleKey = 'operations' | 'production' | 'workshop' | 'mixing' | 'schedule' | 'orders' | 'evaluation' | 'rnd';

export const ROLE_KEYS: UserRole[] = ['owner', 'manager', 'operator', 'quality', 'maintenance', 'viewer', 'sysadmin', 'ptown'];
export const MODULE_KEYS: ModuleKey[] = ['operations', 'production', 'workshop', 'mixing', 'schedule', 'orders', 'evaluation', 'rnd'];

export interface PlantProfile {
  name: string;
  manager: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  licenseNumber: string;
  capacityM3: string;
  mixerCount: string;
  truckCount: string;
  foundingYear: string;
  notes: string;
}

export interface ManagedUser {
  username: string;
  password: string;
  name: string;
  email: string;
  phone: string;
  plantName: string;
  country: string;
  city: string;
  role: UserRole;
  isActive: boolean;
  permissions: Record<ModuleKey, boolean>;
}

export const DEFAULT_PLANT: PlantProfile = {
  name: '',
  manager: '',
  address: '',
  city: '',
  country: '',
  phone: '',
  email: '',
  licenseNumber: '',
  capacityM3: '',
  mixerCount: '',
  truckCount: '',
  foundingYear: '',
  notes: '',
};

export function rolePermissions(role: UserRole): Record<ModuleKey, boolean> {
  const all = (): Record<ModuleKey, boolean> => ({
    operations: true, production: true, workshop: true, mixing: true,
    schedule: true, orders: true, evaluation: true, rnd: true,
  });
  const none = (): Record<ModuleKey, boolean> => ({
    operations: false, production: false, workshop: false, mixing: false,
    schedule: false, orders: false, evaluation: false, rnd: false,
  });
  switch (role) {
    case 'owner':
    case 'manager':
    case 'sysadmin':
    case 'ptown':
      return all();
    case 'operator':
      return { ...none(), operations: true, production: true, schedule: true, orders: true };
    case 'quality':
      return { ...none(), mixing: true, evaluation: true };
    case 'maintenance':
      return { ...none(), workshop: true };
    case 'viewer':
      return none();
  }
}

const DEFAULT_USERS: ManagedUser[] = [
  {
    username: 'admin',
    password: 'admin123',
    name: 'Plant Owner',
    email: '',
    phone: '',
    plantName: 'Concrete Plant',
    country: 'Other',
    city: 'Other',
    role: 'owner',
    isActive: true,
    permissions: rolePermissions('owner'),
  },
];

interface AdminContextType {
  plant: PlantProfile;
  savePlant: (p: PlantProfile) => void;
  users: ManagedUser[];
  addUser: (u: ManagedUser) => boolean;
  updateUser: (u: ManagedUser) => void;
  deleteUser: (username: string) => void;
  canAccess: (module: string) => boolean;
  canManageAdmin: () => boolean;
  isLoading: boolean;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

const PLANT_KEY = 'concrete_admin_plant';
const USERS_KEY = 'concrete_admin_users';

function syncRegistered(user: ManagedUser, remove: boolean) {
  try {
    const saved = localStorage.getItem('registeredUsers');
    const list: Array<Record<string, unknown>> = saved ? JSON.parse(saved) : [];
    const filtered = list.filter(x => String(x.username).toLowerCase() !== user.username.toLowerCase());
    if (!remove) {
      filtered.push({
        username: user.username,
        password: user.password,
        country: user.country || 'Other',
        city: user.city || 'Other',
        plantName: user.plantName || user.name || 'Concrete Plant',
        phone: user.phone || '',
        email: user.email || '',
        status: user.isActive ? 'MANAGED' : 'INACTIVE',
      });
    }
    localStorage.setItem('registeredUsers', JSON.stringify(filtered));
  } catch {}
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  const [plant, setPlant] = useState<PlantProfile>(DEFAULT_PLANT);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) Try Supabase (source of truth when configured)
      const [dbPlant, dbUsers] = await Promise.all([
        loadPlantProfileFromSupabase('admin'),
        loadAdminUsersFromSupabase(),
      ]);
      if (cancelled) return;
      if (dbPlant) {
        const mapped: PlantProfile = {
          name: dbPlant.name || '', manager: dbPlant.manager || '', address: dbPlant.address || '',
          city: dbPlant.city || '', country: dbPlant.country || '', phone: dbPlant.phone || '',
          email: dbPlant.email || '', licenseNumber: dbPlant.license_number || '',
          capacityM3: dbPlant.capacity_m3 || '', mixerCount: dbPlant.mixer_count || '',
          truckCount: dbPlant.truck_count || '', foundingYear: dbPlant.founding_year || '',
          notes: dbPlant.notes || '',
        };
        setPlant(mapped);
        try { localStorage.setItem(PLANT_KEY, JSON.stringify(mapped)); } catch {}
      } else {
        try {
          const savedPlant = localStorage.getItem(PLANT_KEY);
          if (savedPlant) setPlant({ ...DEFAULT_PLANT, ...JSON.parse(savedPlant) });
        } catch {}
      }
      if (dbUsers.length > 0) {
        const mapped: ManagedUser[] = dbUsers.map(u => ({
          username: u.username, password: u.password || '', name: u.name || '',
          email: u.email || '', phone: u.phone || '', plantName: u.plant_name || '',
          country: u.country || 'Other', city: u.city || 'Other',
          role: (u.role as UserRole) || 'viewer',
          isActive: u.is_active !== false,
          permissions: (u.permissions || rolePermissions((u.role as UserRole) || 'viewer')) as Record<ModuleKey, boolean>,
        }));
        setUsers(mapped);
        try { localStorage.setItem(USERS_KEY, JSON.stringify(mapped)); } catch {}
        mapped.forEach(u => syncRegistered(u, false));
        setIsLoading(false);
        return;
      }
      try {
        const savedUsers = localStorage.getItem(USERS_KEY);
        if (savedUsers) {
          const parsed = JSON.parse(savedUsers) as ManagedUser[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setUsers(parsed);
            setIsLoading(false);
            return;
          }
        }
        setUsers(DEFAULT_USERS);
        DEFAULT_USERS.forEach(u => syncRegistered(u, false));
      } catch {
        setUsers(DEFAULT_USERS);
        DEFAULT_USERS.forEach(u => syncRegistered(u, false));
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const savePlant = (p: PlantProfile) => {
    setPlant(p);
    try { localStorage.setItem(PLANT_KEY, JSON.stringify(p)); } catch {}
    savePlantProfileToSupabase({
      username: 'admin', name: p.name, manager: p.manager, address: p.address,
      city: p.city, country: p.country, phone: p.phone, email: p.email,
      license_number: p.licenseNumber, capacity_m3: p.capacityM3, mixer_count: p.mixerCount,
      truck_count: p.truckCount, founding_year: p.foundingYear, notes: p.notes,
    }).catch(() => {});
  };

  const addUser = (u: ManagedUser): boolean => {
    if (users.some(x => x.username.toLowerCase() === u.username.toLowerCase())) return false;
    const next = [...users, u];
    setUsers(next);
    try { localStorage.setItem(USERS_KEY, JSON.stringify(next)); } catch {}
    syncRegistered(u, false);
    saveAdminUserToSupabase({
      username: u.username, password: u.password, name: u.name, email: u.email,
      phone: u.phone, plant_name: u.plantName, country: u.country, city: u.city,
      role: u.role, is_active: u.isActive, permissions: u.permissions,
    }).catch(() => {});
    return true;
  };

  const updateUser = (u: ManagedUser) => {
    const next = users.map(x => x.username.toLowerCase() === u.username.toLowerCase() ? u : x);
    setUsers(next);
    try { localStorage.setItem(USERS_KEY, JSON.stringify(next)); } catch {}
    syncRegistered(u, false);
    saveAdminUserToSupabase({
      username: u.username, password: u.password, name: u.name, email: u.email,
      phone: u.phone, plant_name: u.plantName, country: u.country, city: u.city,
      role: u.role, is_active: u.isActive, permissions: u.permissions,
    }).catch(() => {});
  };

  const deleteUser = (username: string) => {
    const target = users.find(x => x.username.toLowerCase() === username.toLowerCase());
    const next = users.filter(x => x.username.toLowerCase() !== username.toLowerCase());
    setUsers(next);
    try { localStorage.setItem(USERS_KEY, JSON.stringify(next)); } catch {}
    if (target) syncRegistered(target, true);
    deleteAdminUserFromSupabase(username).catch(() => {});
  };

  const canAccess = (module: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.status === 'GUEST') return true;
    const norm = (module === 'operation' ? 'operations' : module) as ModuleKey;
    if (currentUser.status === 'APP_ACCOUNT') {
      const role = String((currentUser as any).role || '');
      if (role === 'sysadmin' || role === 'ptown') return true;
      const mods = (currentUser as any).mods as string[] | undefined;
      const list = Array.isArray(mods) && mods.length ? mods : treeModsForRole(role);
      return list.includes(norm);
    }
    const u = users.find(x => x.username.toLowerCase() === currentUser.username.toLowerCase());
    if (!u) return true;
    if (!u.isActive) return false;
    if (u.role === 'owner' || u.role === 'manager') return true;
    return !!u.permissions[norm];
  };

  const canManageAdmin = (): boolean => {
    if (!currentUser) return false;
    if (currentUser.status === 'GUEST') return true;
    if (currentUser.status === 'APP_ACCOUNT') {
      const role = String((currentUser as any).role || '');
      return role === 'sysadmin' || role === 'owner' || role === 'manager';
    }
    const u = users.find(x => x.username.toLowerCase() === currentUser.username.toLowerCase());
    if (!u) return true;
    return u.isActive && (u.role === 'owner' || u.role === 'manager');
  };

  return (
    <AdminContext.Provider value={{ plant, savePlant, users, addUser, updateUser, deleteUser, canAccess, canManageAdmin, isLoading }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}
