import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  api, getToken, setTokens, saveSession, loadSession, clearSession, type SessionUser,
} from '../api/client';
import { loadPlantProfile } from '../firebase/firestore';

export interface UserSession {
  username: string;
  password: string;
  country: string;
  city: string;
  plantName: string;
  phone: string;
  email: string;
  status: string;
  role?: string;
  fullName?: string;
}

interface AuthContextType {
  currentUser: UserSession | null;
  registeredUsers: UserSession[];
  login: (identifier: string, password: string) => Promise<boolean>;
  register: (user: UserSession) => Promise<{ success: boolean; code: string; emailSent: boolean }>;
  verifyAndActivate: (code: string) => Promise<boolean>;
  loginAsGuest: (guestPassword: string) => Promise<void>;
  logout: () => void;
  generatedCode: string;
  tempUser: UserSession | null;
  emailSending: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// SECURITY: no passwords live in the frontend bundle. The guest account password
// is provided at runtime by the owner (and rotated in the DB), never hardcoded here.
const GUEST_EMAIL = 'guest@migrated.fimtosoft.com';

function toUserSession(user: SessionUser, profile: any): UserSession {
  return {
    username: user.employeeCode || user.fullName || user.email,
    password: '',
    country: profile?.country || '—',
    city: profile?.city || '—',
    plantName: profile?.name || user.fullName || user.email,
    phone: user.phoneNumber || '',
    email: user.email,
    status: 'ACTIVE',
    role: user.role,
    fullName: user.fullName,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [registeredUsers] = useState<UserSession[]>([]);
  const [generatedCode] = useState('');
  const [tempUser] = useState<UserSession | null>(null);
  const [emailSending] = useState(false);

  // Restore session from localStorage (token + cached user snapshot)
  useEffect(() => {
    if (!getToken()) return;
    const session = loadSession();
    if (!session) return;
    const cached = localStorage.getItem('currentUserSession');
    if (cached) {
      try {
        setCurrentUser(JSON.parse(cached));
        return;
      } catch { /* ignore */ }
    }
    setCurrentUser(toUserSession(session, {}));
  }, []);

  const buildSession = async (user: SessionUser): Promise<UserSession> => {
    let profile: any = {};
    try {
      profile = (await loadPlantProfile('me')) || {};
    } catch { /* profile optional */ }
    const built = toUserSession(user, profile);
    localStorage.setItem('currentUserSession', JSON.stringify(built));
    return built;
  };

  const login = async (identifier: string, password: string): Promise<boolean> => {
    try {
      const data = await api.post<{ accessToken: string; refreshToken: string; user: SessionUser }>(
        '/api/auth/login',
        { identifier, password, deviceInfo: { platform: 'web', appVersion: '1.0.0', deviceId: 'website' } }
      );
      setTokens(data.accessToken, data.refreshToken);
      saveSession(data.user);
      const built = await buildSession(data.user);
      setCurrentUser(built);
      return true;
    } catch (e: any) {
      console.warn('Login failed:', e?.message || e);
      clearSession();
      localStorage.removeItem('currentUserSession');
      setCurrentUser(null);
      return false;
    }
  };

  // Registration is now managed by the ERP admin panel (accounts are
  // created by the owner). Kept for API compatibility.
  const register = async (_user: UserSession): Promise<{ success: boolean; code: string; emailSent: boolean }> => {
    return { success: false, code: '', emailSent: false };
  };

  const verifyAndActivate = async (_code: string): Promise<boolean> => {
    return false;
  };

  const loginAsGuest = async (guestPassword: string): Promise<void> => {
    const ok = await login(GUEST_EMAIL, guestPassword);
    if (!ok) throw new Error('Guest login failed');
  };

  const logout = () => {
    clearSession();
    localStorage.removeItem('currentUserSession');
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{
      currentUser, registeredUsers, login, register, verifyAndActivate, loginAsGuest, logout, generatedCode, tempUser, emailSending
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
