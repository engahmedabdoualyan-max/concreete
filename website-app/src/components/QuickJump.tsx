import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuickJumpDict } from '../i18n/quickJumpDict';
import { useDate, formatDate } from '../context/DateContext';

const ALL_PAGES = [
  { path: '/', labelKey: 'home' as const },
  { path: '/operations', labelKey: 'operations' as const },
  { path: '/workshop', labelKey: 'workshop' as const },
  { path: '/fleet/coding', labelKey: 'fleetCoding' as const },
  { path: '/sites', labelKey: 'sites' as const },
  { path: '/command', labelKey: 'command' as const },
  { path: '/hr', labelKey: 'hr' as const },
  { path: '/forms', labelKey: 'forms' as const },
  { path: '/gate', labelKey: 'gate' as const },
  { path: '/procurement', labelKey: 'procurement' as const },
  { path: '/mixing', labelKey: 'mixing' as const },
  { path: '/production', labelKey: 'production' as const },
  { path: '/materials', labelKey: 'materials' as const },
  { path: '/evaluation', labelKey: 'evaluation' as const },
  { path: '/schedule', labelKey: 'schedule' as const },
  { path: '/orders', labelKey: 'orders' as const },
  { path: '/rnd', labelKey: 'rnd' as const },
  { path: '/governance', labelKey: 'governance' as const },
  { path: '/finance', labelKey: 'finance' as const },
  { path: '/multiplant', labelKey: 'multiplant' as const },
];

// Role → allowed page paths. Unknown roles see everything (fallback).
const ROLE_ACCESS: Record<string, string[]> = {
  SUPER_ADMIN: ALL_PAGES.map(p => p.path),
  PLANT_MGR: ALL_PAGES.map(p => p.path),
  ACCOUNTANT: ['/', '/orders', '/schedule', '/finance'],
  QUALITY_MGR: ['/', '/mixing', '/evaluation', '/governance', '/rnd'],
  LAB_TECH: ['/', '/mixing', '/evaluation', '/governance', '/rnd'],
  // Device coding is a fleet action — the same people who code a probe onto a
  // truck are the ones who move it to another truck. DISPATCHER/WORKSHOP_MGR and
  // SUPER_ADMIN reach it via ALL_PAGES.
  PRODUCTION_OP: ['/', '/workshop', '/fleet/coding', '/mixing', '/production', '/materials', '/gate', '/forms'],
  // Gate officer: home + gate only. Deliberately NOT the STOREKEEPER set —
  // the gate account must not see procurement, finance or HR cards.
  GATE_OPERATOR: ['/', '/gate'],
  DRIVER: ['/', '/operations'],
};

export default function QuickJump() {
  const navigate = useNavigate();
  const t = useQuickJumpDict();
  const { calendarType, toggleCalendar } = useDate();
  const today = formatDate(new Date(), calendarType);
  const { currentUser } = useAuth();
  const role = currentUser?.role || '';

  const allowed = ROLE_ACCESS[role] ?? ALL_PAGES.map(p => p.path);
  const pages = ALL_PAGES.filter(p => allowed.includes(p.path));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        onChange={(e) => { if (e.target.value) navigate(e.target.value); }}
        className="bg-white/[0.04] text-slate-300 text-xs border border-white/10 px-2 py-1.5 rounded hover:text-white cursor-pointer outline-none"
        defaultValue=""
      >
        <option value="">🚀 Quick Jump...</option>
        {pages.map(p => (
          <option key={p.path} value={p.path}>t(p.labelKey)</option>
        ))}
      </select>
      <button
        onClick={toggleCalendar}
        className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs px-3 py-1.5 rounded font-bold hover:from-sky-400 hover:to-cyan-400 transition"
        title={t('toggleCalendar')}
      >
        {calendarType === 'gregorian' ? t('gregorian') : t('hijri')}
      </button>
      <span className="text-[10px] text-slate-400 font-mono bg-white/[0.04] px-2 py-1 rounded border border-white/10">
        {today}
      </span>
      {role && (
        <span className="text-[10px] text-sky-300 font-mono bg-sky-500/10 px-2 py-1 rounded border border-sky-500/30">
          {role}
        </span>
      )}
    </div>
  );
}
