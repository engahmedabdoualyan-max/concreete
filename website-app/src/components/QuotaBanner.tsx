import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useQuotaBannerDict } from '../i18n/quotaBannerDict';
import { getStorageStatus } from '../firebase/firestore';

// بيانات التواصل مع المبرمج لترقية القاعدة — عدّلها هنا
const DEVELOPER_EMAIL = 'support@fimtosoft.com';
const DEVELOPER_WHATSAPP = 'https://wa.me/200000000000';

export default function QuotaBanner() {
  const { currentUser } = useAuth();
  const t = useQuotaBannerDict();
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
            <p className="text-sm font-bold text-red-400">{t('quotaBlocked').replace('{quota}', String(status.quotaMB))}</p>
            <p className="text-xs text-slate-200 mt-0.5">{t('quotaBlockedSub')}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href={`mailto:${DEVELOPER_EMAIL}`} className="bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white text-xs font-bold px-3 py-2 rounded shadow-[0_0_20px_rgba(56,189,248,0.3)]">{t('contactDev')}</a>
            <a href={DEVELOPER_WHATSAPP} target="_blank" rel="noreferrer" className="bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white text-xs font-bold px-3 py-2 rounded">{t('whatsapp')}</a>
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
    <div className={`border rounded-lg p-3 mb-4 ${warn ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-white/[0.03] border-white/10'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div>
          <p className={`text-sm font-bold ${warn ? 'text-yellow-400' : 'text-slate-200'}`}>
            {t('storageUsage').replace('{used}', status.usedMB.toFixed(2)).replace('{quota}', String(status.quotaMB))}
          </p>
          <p className={`text-xs mt-0.5 ${warn ? 'text-yellow-300/80' : 'text-slate-400'}`}>
            {warn
              ? t('warnNearLimit')
              : t('remaining').replace('{remaining}', status.remainingMB.toFixed(2))}
          </p>
        </div>
        {warn && (
          <div className="flex gap-2 flex-wrap">
            <a href={`mailto:${DEVELOPER_EMAIL}`} className="bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white text-xs font-bold px-3 py-2 rounded">{t('contactDev')}</a>
            <a href={DEVELOPER_WHATSAPP} target="_blank" rel="noreferrer" className="bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white text-xs font-bold px-3 py-2 rounded">{t('whatsapp')}</a>
          </div>
        )}
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden mt-2 ${warn ? 'bg-yellow-900/60' : 'bg-slate-700/60'}`}>
        <div className={`h-full transition-all ${warn ? 'bg-yellow-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, status.pct)}%` }} />
      </div>
    </div>
  );
}
