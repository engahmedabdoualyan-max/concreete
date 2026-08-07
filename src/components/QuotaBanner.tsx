import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getStorageStatus } from '../firebase/firestore';

// بيانات التواصل مع المبرمج لترقية القاعدة — عدّلها هنا
const DEVELOPER_EMAIL = 'support@fimtosoft.com';
const DEVELOPER_WHATSAPP = 'https://wa.me/200000000000';

export default function QuotaBanner() {
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<{ quotaMB: number; usedMB: number; remainingMB: number; pct: number; overQuota: boolean } | null>(null);
  const [hardBlocked, setHardBlocked] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.status === 'GUEST') return;
    let mounted = true;
    const load = () => {
      getStorageStatus(currentUser.username)
        .then(s => {
          if (!mounted) return;
          setStatus(s);
          if (!s.overQuota) setHardBlocked(false);
        })
        .catch(() => {});
      try { setHardBlocked(localStorage.getItem('concrete_quota_over') === '1'); } catch { }
    };
    load();
    const iv = window.setInterval(load, 15000);
    window.addEventListener('storage', load);
    return () => { mounted = false; window.clearInterval(iv); window.removeEventListener('storage', load); };
  }, [currentUser?.username]);

  if (!currentUser || !status) return null;
  const blocked = status.overQuota || hardBlocked;
  if (blocked) {
    return (
      <div className="bg-red-500/15 border border-red-500/40 rounded-lg p-3 mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-red-400">🚫 تم استهلاك مساحة التخزين الخاصة بك بالكامل ({status.quotaMB} MB)</p>
            <p className="text-xs text-slate-300 mt-0.5">لا يمكن حفظ المزيد من البيانات. تواصل مع المبرمج لزيادة قاعدة بياناتك.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href={`mailto:${DEVELOPER_EMAIL}`} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded">✉️ تواصل مع المبرمج</a>
            <a href={DEVELOPER_WHATSAPP} target="_blank" rel="noreferrer" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded">💬 واتساب</a>
          </div>
        </div>
        <div className="h-1.5 bg-red-900/60 rounded-full overflow-hidden mt-3">
          <div className="h-full bg-red-500" style={{ width: '100%' }} />
        </div>
      </div>
    );
  }
  const warn = status.pct >= 80;
  return (
    <div className={`border rounded-lg p-3 mb-4 ${warn ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-slate-500/10 border-slate-600/40'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <p className={`text-sm font-bold ${warn ? 'text-yellow-400' : 'text-slate-300'}`}>
            💾 مساحة التخزين الخاصة بك: {status.usedMB.toFixed(2)} MB من {status.quotaMB} MB
          </p>
          <p className={`text-xs mt-0.5 ${warn ? 'text-yellow-300/80' : 'text-slate-400'}`}>
            {warn
              ? '⚠️ اقتربت من نهاية مساحتك — إذا احتجت قاعدة أكبر تواصل مع المبرمج.'
              : `تبقى لديك ${status.remainingMB.toFixed(2)} MB`}
          </p>
        </div>
        {warn && (
          <div className="flex gap-2 flex-wrap">
            <a href={`mailto:${DEVELOPER_EMAIL}`} className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold px-3 py-2 rounded">✉️ تواصل مع المبرمج</a>
            <a href={DEVELOPER_WHATSAPP} target="_blank" rel="noreferrer" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded">💬 واتساب</a>
          </div>
        )}
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden mt-2 ${warn ? 'bg-yellow-900/60' : 'bg-slate-700/60'}`}>
        <div className={`h-full transition-all ${warn ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, status.pct)}%` }} />
      </div>
    </div>
  );
}
