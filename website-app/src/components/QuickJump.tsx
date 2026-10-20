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
  { path: '/suppliers', labelKey: 'suppliers' as const },
  { path: '/debts', labelKey: 'debts' as const },
  { path: '/board/workshop', labelKey: 'boardWorkshop' as const },
  { path: '/board/plant', labelKey: 'boardPlant' as const },
];

// Role → allowed page paths. Unknown roles see everything (fallback).
const ROLE_ACCESS: Record<string, string[]> = {
  SUPER_ADMIN: ALL_PAGES.map(p => p.path),
  PLANT_MGR: ALL_PAGES.map(p => p.path),
  ACCOUNTANT: ['/', '/orders', '/schedule', '/finance', '/suppliers', '/debts'],
  QUALITY_MGR: ['/', '/mixing', '/evaluation', '/governance', '/rnd'],
  // Lab accounts see the lab section only — everything else is locked.
  LAB_TECH: ['/', '/mixing'],
  LAB_TECHNICIAN: ['/', '/mixing'],
  LAB_MGR: ['/', '/mixing'],
  // Device coding is a fleet action — the same people who code a probe onto a
  // truck are the ones who move it to another truck. DISPATCHER/WORKSHOP_MGR and
  // SUPER_ADMIN reach it via ALL_PAGES.
  PRODUCTION_OP: ['/', '/workshop', '/board/workshop', '/fleet/coding', '/mixing', '/production', '/board/plant', '/materials', '/gate', '/forms'],
  WORKSHOP_MGR: ['/', '/workshop', '/board/workshop', '/fleet/coding', '/materials'],
  DISPATCHER: ['/', '/operations', '/board/plant', '/schedule', '/workshop', '/board/workshop'],
  // Gate officer: home + gate only. Deliberately NOT the STOREKEEPER set —
  // the gate account must not see procurement, finance or HR cards.
  GATE_OPERATOR: ['/', '/gate'],
  DRIVER: ['/', '/operations', '/board/plant'],
  // مدير المشتروات: dashboard + his own module + materials. The finance and HR
  // entries must not be offered — he cannot open them, and a menu that leads to
  // a 403 reads as "the system is broken".
  PURCHASING_MGR: ['/', '/procurement', '/materials'],

  // ── API roles that used to fall through to the "unknown role sees everything
  //    fallback" above. Each entry mirrors that role's dashboard modules
  //    (API_ROLE_MODS in lib/treeRoles.ts): a page its card already opens stays
  //    in the dropdown, and a page that answers 403 is not offered. Board and
  //    forms screens are read-only utilities and are added where they belong.
  SALES_REP: ['/', '/orders', '/operations'],
  REPS_MGR: ['/', '/orders'],
  SCHEDULE_MGR: ['/', '/schedule', '/orders', '/board/plant'],
  OPERATIONS_MGR: ['/', '/operations', '/schedule', '/orders', '/multiplant', '/procurement', '/board/plant'],
  PRODUCTION_MGR: ['/', '/production', '/mixing', '/workshop', '/multiplant', '/procurement', '/board/plant', '/board/workshop'],
  STOREKEEPER: ['/', '/production', '/orders', '/materials', '/procurement'],
  WORKSHOP_MECHANIC: ['/', '/workshop', '/board/workshop'],
  MECHANIC: ['/', '/workshop', '/board/workshop'],
  STATION_TECH: ['/', '/workshop', '/mixing', '/multiplant', '/board/workshop', '/board/plant'],
  BATCH_OP: ['/', '/production', '/mixing', '/multiplant', '/board/plant'],
  BATCH_OPERATOR: ['/', '/production', '/mixing', '/multiplant', '/board/plant'],
  RND_MANAGER: ['/', '/rnd', '/evaluation', '/orders'],
  HR_OFFICER: ['/', '/hr', '/orders', '/forms'],
  HR_MANAGER: ['/', '/hr', '/orders', '/evaluation', '/forms'],
  // Finance family mirrors the ACCOUNTANT entry above (register + debts stay
  // reachable for anyone who reads money).
  CFO: ['/', '/orders', '/evaluation', '/finance', '/governance', '/procurement', '/suppliers', '/debts'],
  FINANCE: ['/', '/orders', '/evaluation', '/finance', '/governance', '/suppliers', '/debts'],
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
        <option value="">{t('quickJump')}</option>
        {pages.map(p => (
          <option key={p.path} value={p.path}>{t(p.labelKey)}</option>
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
