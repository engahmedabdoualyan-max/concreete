import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import emailjs from '@emailjs/browser';
import { saveUser, getUser, clearPresence } from '../firebase/firestore';
import { hashPassword } from '../lib/passwords';
import { findTreeAccount, treeResultToSession } from '../api/tree-auth';
import {
  api,
  clearSession,
  getToken,
  saveSession,
  setTokens,
  type SessionUser,
} from '../api/client';

const EMAILJS_PUBLIC_KEY = 'UPIUNYeckrEK-z_xz';
const EMAILJS_SERVICE_ID = 'service_mdtxmv8';
const EMAILJS_TEMPLATE_ID = 'template_ablqhm3';

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
  tenantId?: string;
  employeeCode?: string;
  mods?: string[];
}

interface AuthContextType {
  currentUser: UserSession | null;
  registeredUsers: UserSession[];
  login: (username: string, password: string) => Promise<boolean>;
  register: (user: UserSession) => Promise<{ success: boolean; code: string; emailSent: boolean }>;
  verifyAndActivate: (code: string) => Promise<boolean>;
  loginAsGuest: (guestPassword?: string) => Promise<void>;
  logout: () => void;
  generatedCode: string;
  tempUser: UserSession | null;
  emailSending: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function sessionUserToUserSession(user: SessionUser, fallbackUsername = ''): UserSession {
  return {
    username: user.email || user.employeeCode || fallbackUsername,
    password: '',
    country: '',
    city: '',
    plantName: '',
    phone: user.phoneNumber || '',
    email: user.email || '',
    status: 'APP_ACCOUNT',
    role: user.role,
    fullName: user.fullName,
    tenantId: user.tenantId,
    employeeCode: user.employeeCode,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [registeredUsers] = useState<UserSession[]>([]);
  const [generatedCode, setGeneratedCode] = useState('');
  const [tempUser, setTempUser] = useState<UserSession | null>(null);
  const [emailSending, setEmailSending] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) emailjs.init(EMAILJS_PUBLIC_KEY);
    // Browser sessions are a development fallback only. Production must be
    // restored from a server-issued, revocable session and revalidated.
    if (import.meta.env.PROD) {
      if (!getToken()) {
        // …or from a tree-account session (same store the Android app uses)
        // so desktop/web refresh keeps tree users logged in.
        try {
          const raw = localStorage.getItem('currentUserSession');
          if (raw) {
            const saved = JSON.parse(raw) as UserSession;
            if (saved && (saved.status === 'TREE_ACCOUNT' || saved.username)) {
              setCurrentUser(saved);
              return;
            }
          }
        } catch {}
        localStorage.removeItem('currentUserSession');
        clearSession();
        return;
      }
      void api.get<{ user: SessionUser }>('/api/auth/me')
        .then(({ user }) => {
          saveSession(user);
          setCurrentUser(sessionUserToUserSession(user));
        })
        .catch(() => clearSession());
      return;
    }
    try {
      const saved = localStorage.getItem('currentUserSession');
      if (saved) setCurrentUser(JSON.parse(saved));
    } catch {}
  }, []);

  // Never persist credentials inside the browser session blob
  const stripSecrets = (u: UserSession): UserSession => {
    const { password, ...rest } = u as any;
    return rest as UserSession;
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    if (import.meta.env.PROD) {
      // 1) ERP backend when deployed…
      try {
        const result = await api.post<{
          accessToken: string;
          refreshToken: string;
          user: SessionUser;
        }>('/api/auth/login', { identifier: username, password });
        setTokens(result.accessToken, result.refreshToken);
        saveSession(result.user);
        setCurrentUser(sessionUserToUserSession(result.user, username));
        return true;
      } catch (error) {
        console.warn('Server login failed, trying tree accounts', error);
      }
      // 2) …otherwise the tree accounts (same store the Android app uses).
      try {
        const found = await findTreeAccount(username, password);
        if (found) {
          const session = treeResultToSession(found);
          setCurrentUser(session);
          localStorage.setItem('currentUserSession', JSON.stringify(stripSecrets(session)));
          return true;
        }
      } catch (error) {
        console.warn('Tree login failed', error);
      }
      return false;
    }

    // Development-only Firebase/local fallback.
    try {
      const user = await getUser(username) as any;
      if (user) {
        const hash = await hashPassword(user.username || username, password);
        if (user.passwordHash && user.passwordHash === hash) {
          setCurrentUser(user as UserSession);
          localStorage.setItem('currentUserSession', JSON.stringify(stripSecrets(user as UserSession)));
          return true;
        }
        // Legacy plaintext account → verify then upgrade to hashed
        if (user.password && user.password === password) {
          try { await saveUser({ ...user, passwordHash: hash, password: '' }); } catch {}
          setCurrentUser(user as UserSession);
          localStorage.setItem('currentUserSession', JSON.stringify(stripSecrets(user as UserSession)));
          return true;
        }
      }
    } catch (e) {
      console.warn('Firebase fetch failed, trying localStorage backup', e);
    }
    // Local browser accounts are a development-only fallback.
    if (import.meta.env.DEV) {
      try {
        const saved = localStorage.getItem('registeredUsers');
        const users: any[] = saved ? JSON.parse(saved) : [];
        let user: any = null;
        for (const u of users) {
          const nameMatch = u.username?.toLowerCase() === username.toLowerCase() || u.email?.toLowerCase() === username.toLowerCase();
          if (!nameMatch) continue;
          const hash = await hashPassword(u.username, password);
          if ((u.passwordHash || '') === hash || u.password === password) { user = u; break; }
        }
        if (user) {
          setCurrentUser(user);
          localStorage.setItem('currentUserSession', JSON.stringify(stripSecrets(user)));
          return true;
        }
      } catch {}
    }
    return false;
  };

  const register = async (user: UserSession): Promise<{ success: boolean; code: string; emailSent: boolean }> => {
    if (import.meta.env.PROD) {
      return { success: false, code: '', emailSent: false };
    }
    // Check duplicate
    try {
      const existing = await getUser(user.username);
      if (existing) return { success: false, code: '', emailSent: false };
    } catch {}

    const code = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedCode(code);
    setTempUser(user);
    setEmailSending(true);

    let emailSent = false;
    try {
      const response = await emailjs.send(
        EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID,
        { to_email: user.email, to_name: user.username, code, plant_name: user.plantName },
        { publicKey: EMAILJS_PUBLIC_KEY }
      );
      if (response.status === 200) emailSent = true;
    } catch (error: any) {
      console.error('EmailJS Error:', error?.text || error?.message || error);
    } finally {
      setEmailSending(false);
    }

    return { success: true, code, emailSent };
  };

  const verifyAndActivate = async (code: string): Promise<boolean> => {
    if (code !== generatedCode || !tempUser) return false;
    const base = { ...tempUser, username: tempUser.username.toLowerCase() };
    // Store ONLY the hash — never a plaintext password.
    const newUser: UserSession = {
      ...base,
      password: '',
      // passwordHash is written as an extra field; saveUser persists the full object
    } as UserSession;
    try {
      const hash = await hashPassword(newUser.username, tempUser.password);
      (newUser as any).passwordHash = hash;
    } catch {}

    // Save to Firebase
    try {
      await saveUser(newUser);
    } catch (e) {
      console.error('Firebase save failed, using localStorage', e);
    }

    // Also save to localStorage as backup
    try {
      const saved = localStorage.getItem('registeredUsers');
      const users: UserSession[] = saved ? JSON.parse(saved) : [];
      users.push(newUser);
      localStorage.setItem('registeredUsers', JSON.stringify(users));
    } catch {}

    setCurrentUser(newUser);
    localStorage.setItem('currentUserSession', JSON.stringify(stripSecrets(newUser)));
    setTempUser(null);
    setGeneratedCode('');
    return true;
  };

  const logout = () => {
    const uname = currentUser?.username;
    if (import.meta.env.PROD) {
      void api.post('/api/auth/logout').catch(() => {});
      clearSession();
    } else {
      localStorage.removeItem('currentUserSession');
    }
    setCurrentUser(null);
    if (uname && import.meta.env.DEV) { try { clearPresence(uname); } catch {} }
  };

  const loginAsGuest = async (guestPassword?: string): Promise<void> => {
    if (import.meta.env.PROD && import.meta.env.VITE_ALLOW_GUEST !== 'true') {
      throw new Error('Guest access is disabled in production');
    }
    if (guestPassword) {
      // Owner-issued guest password: try an app account login
      const ok = await login('guest@migrated.fimtosoft.com', guestPassword);
      if (!ok) {
        // Fall back to a local guest session instead of throwing
        setGuest();
        return;
      }
      return;
    }
    setGuest();
  };

  const setGuest = () => {
    if (import.meta.env.PROD && import.meta.env.VITE_ALLOW_GUEST !== 'true') {
      throw new Error('Guest access is disabled in production');
    }
    const guest: UserSession = {
      username: 'guest',
      password: '',
      country: 'Guest',
      city: 'Guest',
      plantName: 'Guest Session',
      phone: '',
      email: '',
      status: 'GUEST',
    };
    setCurrentUser(guest);
    localStorage.setItem('currentUserSession', JSON.stringify(stripSecrets(guest)));
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
