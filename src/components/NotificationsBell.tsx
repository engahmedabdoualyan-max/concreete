import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { loadNotifications, markNotificationsRead, type Notification } from '../firebase/firestore';

const LEVEL_STYLE: Record<string, string> = {
  info: 'border-blue-500/40 bg-blue-500/10',
  success: 'border-emerald-500/40 bg-emerald-500/10',
  warn: 'border-yellow-500/40 bg-yellow-500/10',
  error: 'border-red-500/40 bg-red-500/10',
};

export default function NotificationsBell() {
  const { currentUser } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const reload = () => {
    if (!currentUser) return;
    loadNotifications(currentUser.username).then(d => setItems(d)).catch(() => {});
  };

  useEffect(() => { reload(); }, [currentUser?.username]);

  useEffect(() => {
    if (!currentUser || !open) return;
    const t = window.setInterval(reload, 15000);
    return () => window.clearInterval(t);
  }, [open, currentUser?.username]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const unread = items.filter(n => !n.read).length;

  const openBell = () => {
    setOpen(o => !o);
    if (!open && currentUser && unread) { markNotificationsRead(currentUser.username).catch(() => {}); }
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={openBell} className="relative w-9 h-9 rounded-lg bg-[#334155] hover:bg-[#3f4863] border border-[#475569] text-sm transition-all" title="الإشعارات">
        🔔
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-[#0f172a]">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] max-h-[70vh] overflow-y-auto bg-[#1e293b] border border-[#334155] rounded-xl shadow-2xl z-[100]">
          <div className="sticky top-0 bg-[#1e293b] border-b border-[#334155] px-4 py-2.5 flex items-center justify-between">
            <p className="text-xs font-bold text-white">🔔 إشعارات النظام</p>
            <button onClick={reload} className="text-[10px] text-slate-400 hover:text-white">🔄</button>
          </div>
          {items.length === 0 && <p className="p-4 text-xs text-slate-500">لا توجد إشعارات بعد.</p>}
          {items.map(n => (
            <div key={n.id} className={`px-4 py-3 border-b border-[#334155]/40 ${LEVEL_STYLE[n.level] || ''}`}>
              <p className="text-xs font-bold text-white">{n.title}</p>
              <p className="text-[11px] text-slate-300 mt-0.5">{n.body}</p>
              <p className="text-[9px] text-slate-500 mt-1">{new Date(n.ts).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
