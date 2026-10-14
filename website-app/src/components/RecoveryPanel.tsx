/**
 * ============================================================
 *  FIMTO SOFT — Admin panel: tenant recovery snapshots
 * ============================================================
 *  Tab content for /admin → Recovery. Talks to the ERP backend:
 *   GET  /api/recovery/backups   (list, newest first)
 *   POST /api/recovery/backup    (take a snapshot now)
 *   POST /api/recovery/restore   (point-in-time restore)
 *
 *  Trilingual (en/ar/ur, English fallback) — matches the ERP
 *  backend's own i18n policy. If the backend is unreachable the
 *  panel degrades to an explanatory notice instead of crashing.
 * ============================================================
 */

import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useLang } from '../context/LangContext';

const STR: Record<string, { en: string; ar: string; ur: string }> = {
  title: { en: '💾 Recovery snapshots', ar: '💾 النسخ الاحتياطية للاسترجاع', ur: '💾 ریکوری بیک اپ' },
  subtitle: {
    en: 'Timestamped copy of this plant data. Worst-case loss is bounded by the snapshot interval (every 6h via scheduler).',
    ar: 'نسخة مؤرخة بالتاريخ والساعة من بيانات المصنع. أقصى خسارة محدودة بالفاصل الزمني للنسخ (كل 6 ساعات تلقائياً).',
    ur: 'اس پلانٹ کے ڈیٹا کی تاریخ اور وقت والی کاپی۔ زیادہ سے زیادہ نقصان بیک اپ کے وقفے تک محدود ہے (خودکار ہر 6 گھنٹے)۔',
  },
  refresh: { en: '🔄 Refresh', ar: '🔄 تحديث', ur: '🔄 ریفریش' },
  password: { en: 'Recovery password', ar: 'باسورد الاسترجاع', ur: 'ریکوری پاس ورڈ' },
  passwordHint: {
    en: 'The recovery password set by the owner. It is sent only to the server, never stored in the browser.',
    ar: 'باسورد الاسترجاع الذي حدده المالك. يُرسل للخادم فقط ولا يُحفظ في المتصفح.',
    ur: 'مالک کی مقرر کردہ ریکوری پاس ورڈ۔ صرف سرور کو بھیجا جاتا ہے، براؤزر میں محفوظ نہیں ہوتا۔',
  },
  backupNow: { en: '📸 Take snapshot now', ar: '📸 أخذ نسخة الآن', ur: '📸 ابھی بیک اپ لیں' },
  backingUp: { en: '⏳ Saving snapshot…', ar: '⏳ جاري حفظ النسخة…', ur: '⏳ بیک اپ محفوظ ہو رہا ہے…' },
  backupDone: { en: 'Snapshot saved', ar: 'تم حفظ النسخة', ur: 'بیک اپ محفوظ ہو گیا' },
  listTitle: { en: 'Saved snapshots (newest first)', ar: 'النسخ المحفوظة (الأحدث أولاً)', ur: 'محفوظ بیک اپ (نیا پہلے)' },
  noBackups: { en: 'No snapshots yet — take the first one above.', ar: 'لا توجد نسخ بعد — خذ أول نسخة من الأعلى.', ur: 'ابھی کوئی بیک اپ نہیں — اوپر سے پہلا بیک اپ لیں۔' },
  restore: { en: 'Restore', ar: 'استرجاع', ur: 'بحال کریں' },
  restoring: { en: '⏳ Restoring…', ar: '⏳ جاري الاسترجاع…', ur: '⏳ بحالی جاری ہے…' },
  restoreDone: { en: 'Restore completed', ar: 'تم الاسترجاع', ur: 'بحالی مکمل ہو گئی' },
  confirmTitle: { en: '⚠️ Confirm restore', ar: '⚠️ تأكيد الاسترجاع', ur: '⚠️ بحالی کی تصدیق' },
  confirmBody: {
    en: 'This overwrites CURRENT plant data with the snapshot below. A safety backup of the current state is taken automatically first. Type RESTORE to proceed.',
    ar: 'سيؤدي هذا لاستبدال بيانات المصنع الحالية بالنسخة المحددة. تُؤخذ نسخة أمان تلقائياً أولاً. اكتب RESTORE للمتابعة.',
    ur: 'اس سے موجودہ پلانٹ ڈیٹا منتخب بیک اپ سے بدل جائے گا۔ پہلے موجودہ حالت کا حفاظتی بیک اپ خودکار لیا جاتا ہے۔ جاری رکھنے کے لیے RESTORE لکھیں۔',
  },
  confirmPlaceholder: { en: 'Type RESTORE', ar: 'اكتب RESTORE', ur: 'RESTORE لکھیں' },
  confirmBtn: { en: 'Confirm restore', ar: 'تأكيد الاسترجاع', ur: 'بحالی کی تصدیق کریں' },
  cancel: { en: 'Cancel', ar: 'إلغاء', ur: 'منسوخ کریں' },
  needPassword: { en: 'Enter the recovery password first.', ar: 'أدخل باسورد الاسترجاع أولاً.', ur: 'پہلے ریکوری پاس ورڈ درج کریں۔' },
  wrongPassword: { en: 'Wrong recovery password.', ar: 'باسورد الاسترجاع غير صحيح.', ur: 'ریکوری پاس ورڈ غلط ہے۔' },
  notConfigured: {
    en: 'Recovery is not configured on the server yet (missing RECOVERY_PASSWORD_HASH) or the API is unreachable. Snapshots start working once the backend is deployed and configured — see RECOVERY.md.',
    ar: 'الاسترجاع غير مُعد على الخادم بعد (RECOVERY_PASSWORD_HASH مفقود) أو الـAPI غير متاح. تعمل النسخ فور نشر الباك إند وضبطه — راجع RECOVERY.md.',
    ur: 'سرور پر ریکوری ابھی ترتیب نہیں دی گئی (RECOVERY_PASSWORD_HASH غائب) یا API دستیاب نہیں۔ بیک اینڈ کی تنصیب اور ترتیب کے بعد بیک اپ کام کرے گا — RECOVERY.md دیکھیں۔',
  },
  rows: { en: 'rows', ar: 'صف', ur: 'قطاریں' },
  tables: { en: 'tables', ar: 'جداول', ur: 'ٹیبلز' },
};

interface BackupFile {
  file: string;
  createdAt: string;
  bytes: number;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 20261014-060000.json → { date: 2026-10-14, time: 06:00:00 } */
function splitStamp(file: string): { date: string; time: string } | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.json$/.exec(file);
  if (!m) return null;
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}:${m[6]}` };
}

export default function RecoveryPanel({ onToast }: { onToast: (msg: string) => void }) {
  const { lang } = useLang();
  const t = (k: keyof typeof STR): string => STR[k][lang as 'en' | 'ar' | 'ur'] ?? STR[k].en;

  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [password, setPassword] = useState('');
  const [busyBackup, setBusyBackup] = useState(false);
  const [lastResult, setLastResult] = useState('');
  const [confirmFile, setConfirmFile] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [busyRestore, setBusyRestore] = useState(false);

  const errMsg = (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === 'INVALID_RECOVERY_PASSWORD') return t('wrongPassword');
      if (e.code === 'RECOVERY_NOT_CONFIGURED' || e.code === 'NETWORK_ERROR' || e.status === 404) return t('notConfigured');
      return e.message;
    }
    return String(e);
  };

  const load = async () => {
    setLoading(true);
    setUnreachable(false);
    try {
      const data = await api.get<{ backups: BackupFile[] }>('/api/recovery/backups');
      setBackups(data.backups ?? []);
    } catch (e) {
      setUnreachable(true);
      setBackups([]);
      void errMsg(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const takeBackup = async () => {
    if (!password) { onToast(t('needPassword')); return; }
    setBusyBackup(true);
    setLastResult('');
    try {
      const data = await api.post<{ manifest: { totalRows: number; tables: Record<string, number> } }>(
        '/api/recovery/backup',
        { recoveryPassword: password }
      );
      const m = data.manifest;
      setLastResult(`✅ ${t('backupDone')}: ${m.totalRows} ${t('rows')} / ${Object.keys(m.tables).length} ${t('tables')}`);
      onToast(t('backupDone'));
      await load();
    } catch (e) {
      onToast(errMsg(e));
    } finally {
      setBusyBackup(false);
    }
  };

  const doRestore = async () => {
    if (!confirmFile) return;
    if (!password) { onToast(t('needPassword')); return; }
    setBusyRestore(true);
    try {
      await api.post('/api/recovery/restore', {
        file: confirmFile,
        confirmText: 'RESTORE',
        recoveryPassword: password,
      });
      setConfirmFile(null);
      setConfirmText('');
      onToast(t('restoreDone'));
      await load();
    } catch (e) {
      onToast(errMsg(e));
    } finally {
      setBusyRestore(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6 backdrop-blur-xl">
        <h2 className="text-xl font-black tracking-tight text-white mb-2">{t('title')}</h2>
        <p className="text-sm text-slate-400 mb-5">{t('subtitle')}</p>

        {unreachable && (
          <div className="mb-5 bg-amber-500/10 border border-amber-500/40 text-amber-300 px-4 py-3 rounded-lg text-sm font-bold">
            {t('notConfigured')}
          </div>
        )}

        <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('password')}</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="off"
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70"
            />
            <p className="text-[11px] text-slate-500 mt-1">{t('passwordHint')}</p>
          </div>
          <button
            onClick={() => void takeBackup()}
            disabled={busyBackup}
            className="bg-sky-500/15 text-sky-300 border border-sky-500/40 hover:bg-sky-500/25 px-5 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
          >
            {busyBackup ? t('backingUp') : t('backupNow')}
          </button>
        </div>

        {lastResult && (
          <p className="mt-3 text-sm font-bold text-emerald-400">{lastResult}</p>
        )}
      </div>

      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-white">{t('listTitle')}</h3>
          <button
            onClick={() => void load()}
            className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:text-sky-300 transition-colors"
          >
            {t('refresh')}
          </button>
        </div>

        {loading ? (
          <p className="text-slate-500 text-sm">⏳ …</p>
        ) : backups.length === 0 ? (
          <p className="text-slate-500 text-sm">{t('noBackups')}</p>
        ) : (
          <div className="space-y-2">
            {backups.map(b => {
              const s = splitStamp(b.file);
              return (
                <div key={b.file} className="flex items-center justify-between gap-3 bg-white/[0.02] rounded-lg px-4 py-3 border border-white/10">
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm" dir="ltr">
                      📸 {s ? `${s.date} · ${s.time}` : b.file}
                    </p>
                    <p className="text-[11px] text-slate-500" dir="ltr">{b.file} · {fmtSize(b.bytes)}</p>
                  </div>
                  <button
                    onClick={() => { setConfirmFile(b.file); setConfirmText(''); }}
                    className="shrink-0 bg-amber-500/10 text-amber-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-amber-500/40 hover:bg-amber-500/20 transition-colors"
                  >
                    {t('restore')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmFile && (
        <div className="bg-red-500/[0.06] rounded-2xl border border-red-500/40 p-6 backdrop-blur-xl">
          <h3 className="text-lg font-black text-red-300 mb-2">{t('confirmTitle')}</h3>
          <p className="text-sm text-slate-300 mb-1" dir="ltr">📸 {confirmFile}</p>
          <p className="text-sm text-slate-400 mb-4">{t('confirmBody')}</p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={t('confirmPlaceholder')}
              dir="ltr"
              className="flex-1 min-w-[180px] px-3 py-2 bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-red-400/70"
            />
            <button
              onClick={() => void doRestore()}
              disabled={busyRestore || confirmText !== 'RESTORE'}
              className="bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25 px-5 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
            >
              {busyRestore ? t('restoring') : t('confirmBtn')}
            </button>
            <button
              onClick={() => { setConfirmFile(null); setConfirmText(''); }}
              className="bg-white/[0.05] text-slate-300 px-5 py-2 rounded-lg font-bold text-sm border border-white/10 hover:text-white transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
