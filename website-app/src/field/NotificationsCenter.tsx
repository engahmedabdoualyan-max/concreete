import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  loadNotifications,
  markNotificationsRead,
  type Notification,
} from "../firebase/firestore";
import { ensureNotifyPermission, notifyDesktop, isTauriRuntime } from "./tauri";

/**
 * Field notifications center (desktop-first, harmless on web).
 * Polls the same notification store as the bell, toasts new arrivals on
 * desktop (system notification), marks read on open.
 */
const LEVEL_STYLE: Record<string, string> = {
  info: "border-sky-500/40 bg-sky-500/10",
  success: "border-emerald-500/40 bg-emerald-500/10",
  warn: "border-yellow-500/40 bg-yellow-500/10",
  error: "border-red-500/40 bg-red-500/10",
};

export function useFieldNotifications(pollMs = 20000) {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const firstRef = useRef(true);

  const reload = async () => {
    if (!currentUser) return;
    try {
      const list = await loadNotifications(currentUser.username);
      setItems(Array.isArray(list) ? list : []);
      if (isTauriRuntime() && (await ensureNotifyPermission())) {
        const fresh = (Array.isArray(list) ? list : []).filter(
          (n) => !n.read && !seenRef.current.has(n.id)
        );
        // Skip the backlog burst on first load — toast only truly new items.
        if (!firstRef.current) {
          fresh.slice(0, 3).forEach((n) => notifyDesktop(n.title, n.body));
        }
        (Array.isArray(list) ? list : []).forEach((n) => seenRef.current.add(n.id));
        firstRef.current = false;
      }
    } catch {
      /* offline — keep last list */
    }
  };

  useEffect(() => {
    seenRef.current = new Set();
    firstRef.current = true;
    reload();
    const t = window.setInterval(reload, pollMs);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  const unread = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const markAllRead = async () => {
    if (!currentUser || !unread) return;
    try {
      await markNotificationsRead(currentUser.username);
      await reload();
    } catch {
      /* ignore */
    }
  };

  return { items, unread, reload, markAllRead };
}

export default function NotificationsCenter() {
  const { items, unread, markAllRead } = useFieldNotifications();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black text-white">🔔 التنبيهات {unread > 0 && (
          <span className="ml-2 text-xs bg-red-500 text-white font-bold px-2 py-0.5 rounded-full">{unread}</span>
        )}</h2>
        <div className="flex gap-2">
          <Link to="/field" className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-2">→ الميدان</Link>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs font-bold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 rounded-lg px-3 py-2">
              تعليم الكل كمقروء
            </button>
          )}
        </div>
      </div>
      {items.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-10">لا تنبيهات حتى الآن — ستظهر هنا فور وصولها 🔕</p>
      )}
      <div className="space-y-2">
        {items.map((n) => (
          <div key={n.id} className={`border rounded-xl px-4 py-3 ${LEVEL_STYLE[n.level] || LEVEL_STYLE.info} ${n.read ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white">{n.title}</p>
              <span className="text-[10px] text-slate-500 whitespace-nowrap">{new Date(n.ts).toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-300 mt-1">{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
