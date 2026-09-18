import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { reportPresence, clearPresence } from '../firebase/firestore';

// Mounted once inside the auth tree. It keeps `users/<username>.lastSeenAt`
// fresh (every 30s) so the admin/console can show who is online, and stamps
// the account as offline when the tab/window closes.
export default function PresenceTracker() {
  const { currentUser } = useAuth();
  const username = currentUser?.username;

  useEffect(() => {
    if (!username) return;
    let disconnected = false;
    let t: ReturnType<typeof setInterval> | null = null;

    const ping = () => { if (!disconnected) reportPresence(username || '').catch(() => {}); };
    const clear = () => { if (!disconnected && username) clearPresence(username).catch(() => {}); };

    ping();
    t = setInterval(ping, 30_000);
    window.addEventListener('beforeunload', clear);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') ping();
      else clear();
    });

    return () => {
      disconnected = true;
      if (t) clearInterval(t);
      window.removeEventListener('beforeunload', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, [username]);

  return null;
}