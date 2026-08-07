import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

export type UserRole = 'owner' | 'manager' | 'operator' | 'quality' | 'maintenance' | 'viewer';
export type ModuleKey = 'operations' | 'production' | 'workshop' | 'mixing' | 'schedule' | 'orders' | 'evaluation' | 'rnd';

export const ROLE_KEYS: UserRole[] = ['owner', 'manager', 'operator', 'quality', 'maintenance', 'viewer'];
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
    try {
      const savedPlant = localStorage.getItem(PLANT_KEY);
      if (savedPlant) setPlant({ ...DEFAULT_PLANT, ...JSON.parse(savedPlant) });
    } catch {}
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
  }, []);

  const savePlant = (p: PlantProfile) => {
    setPlant(p);
    try { localStorage.setItem(PLANT_KEY, JSON.stringify(p)); } catch {}
  };

  const addUser = (u: ManagedUser): boolean => {
    if (users.some(x => x.username.toLowerCase() === u.username.toLowerCase())) return false;
    const next = [...users, u];
    setUsers(next);
    try { localStorage.setItem(USERS_KEY, JSON.stringify(next)); } catch {}
    syncRegistered(u, false);
    return true;
  };

  const updateUser = (u: ManagedUser) => {
    const next = users.map(x => x.username.toLowerCase() === u.username.toLowerCase() ? u : x);
    setUsers(next);
    try { localStorage.setItem(USERS_KEY, JSON.stringify(next)); } catch {}
    syncRegistered(u, false);
  };

  const deleteUser = (username: string) => {
    const target = users.find(x => x.username.toLowerCase() === username.toLowerCase());
    const next = users.filter(x => x.username.toLowerCase() !== username.toLowerCase());
    setUsers(next);
    try { localStorage.setItem(USERS_KEY, JSON.stringify(next)); } catch {}
    if (target) syncRegistered(target, true);
  };

  const canAccess = (module: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.status === 'GUEST') return true;
    const norm = (module === 'operation' ? 'operations' : module) as ModuleKey;
    const u = users.find(x => x.username.toLowerCase() === currentUser.username.toLowerCase());
    if (!u) return true;
    if (!u.isActive) return false;
    if (u.role === 'owner' || u.role === 'manager') return true;
    return !!u.permissions[norm];
  };

  const canManageAdmin = (): boolean => {
    if (!currentUser) return false;
    if (currentUser.status === 'GUEST') return true;
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
