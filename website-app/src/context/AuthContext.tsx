import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import emailjs from '@emailjs/browser';
import { saveUser, getUser } from '../firebase/firestore';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [registeredUsers] = useState<UserSession[]>([]);
  const [generatedCode, setGeneratedCode] = useState('');
  const [tempUser, setTempUser] = useState<UserSession | null>(null);
  const [emailSending, setEmailSending] = useState(false);

  useEffect(() => {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    // Try restore session
    try {
      const saved = localStorage.getItem('currentUserSession');
      if (saved) setCurrentUser(JSON.parse(saved));
    } catch {}
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    // Try Firebase first
    try {
      const user = await getUser(username);
      if (user && user.password === password) {
        setCurrentUser(user as UserSession);
        localStorage.setItem('currentUserSession', JSON.stringify(user));
        return true;
      }
    } catch (e) {
      console.warn('Firebase fetch failed, trying localStorage backup', e);
    }
    // Fallback to localStorage (match by username or email)
    try {
      const saved = localStorage.getItem('registeredUsers');
      const users: UserSession[] = saved ? JSON.parse(saved) : [];
      const user = users.find(u =>
        (u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === username.toLowerCase()) &&
        u.password === password
      );
      if (user) {
        setCurrentUser(user);
        localStorage.setItem('currentUserSession', JSON.stringify(user));
        return true;
      }
    } catch {}
    return false;
  };

  const register = async (user: UserSession): Promise<{ success: boolean; code: string; emailSent: boolean }> => {
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
    const newUser = { ...tempUser, username: tempUser.username.toLowerCase() };

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
    localStorage.setItem('currentUserSession', JSON.stringify(newUser));
    setTempUser(null);
    setGeneratedCode('');
    return true;
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUserSession');
  };

  const loginAsGuest = async (guestPassword?: string): Promise<void> => {
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
    localStorage.setItem('currentUserSession', JSON.stringify(guest));
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
