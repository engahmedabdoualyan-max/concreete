import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, type User } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE",
  authDomain: "concrete-erb.firebaseapp.com",
  projectId: "concrete-erb",
  storageBucket: "concrete-erb.firebasestorage.app",
  messagingSenderId: "964088736698",
  appId: "1:964088736698:web:bed223d45d1240c101cb83",
  measurementId: "G-YG66TJNMGF"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

/**
 * Anonymous Auth is a local-development compatibility path only. Production
 * must use a server-issued Firebase identity with tenant claims; silently
 * creating anonymous users would defeat the production Rules boundary.
 */
export async function ensureFirebaseAuth(): Promise<User | null> {
  if (import.meta.env.PROD) {
    console.warn('[auth] Firebase anonymous access is disabled in production');
    return null;
  }
  try {
    if (auth.currentUser) return auth.currentUser;
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (err: any) {
    const code = String(err?.code || '');
    if (code.includes('operation-not-allowed') || code.includes('configuration-not-found')) {
      console.warn('[auth] Anonymous sign-in not enabled yet in Firebase console');
    } else {
      console.warn('[auth] anonymous sign-in failed:', code);
    }
    return null;
  }
}
export default app;
