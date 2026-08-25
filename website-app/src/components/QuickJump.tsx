import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDate, formatDate } from '../context/DateContext';

const ALL_PAGES = [
  { path: '/', label: '🏠 Dashboard' },
  { path: '/operations', label: '🚚 Operations Tracker' },
  { path: '/workshop', label: '🔧 Workshop / Maintenance' },
  { path: '/mixing', label: '🎛️ Mixing & Quality' },
  { path: '/production', label: '🏭 Production & Inventory' },
  { path: '/materials', label: '🏗️ الخامات والمخزون والخلطات' },
  { path: '/evaluation', label: '📊 Plant OEE Evaluation' },
  { path: '/schedule', label: '📅 Pouring Schedule' },
  { path: '/orders', label: '📦 Orders' },
  { path: '/rnd', label: '🔬 R&D' },
  { path: '/governance', label: '🛡️ Governance: Weighbridge & Returns' },
  { path: '/finance', label: '💰 Finance: Payments & Reorder' },
  { path: '/multiplant', label: '🏭 Multi-Plant Command Center' },
];

// Role → allowed page paths. Unknown roles see everything (fallback).
const ROLE_ACCESS: Record<string, string[]> = {
  SUPER_ADMIN: ALL_PAGES.map(p => p.path),
  PLANT_MGR: ALL_PAGES.map(p => p.path),
  ACCOUNTANT: ['/', '/orders', '/schedule', '/finance'],
  QUALITY_MGR: ['/', '/mixing', '/evaluation', '/governance', '/rnd'],
  LAB_TECH: ['/', '/mixing', '/evaluation', '/governance', '/rnd'],
  PRODUCTION_OP: ['/', '/workshop', '/mixing', '/production', '/materials'],
  DRIVER: ['/', '/operations'],
};

export default function QuickJump() {
  const navigate = useNavigate();
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
          <option key={p.path} value={p.path}>{p.label}</option>
        ))}
      </select>
      <button
        onClick={toggleCalendar}
        className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs px-3 py-1.5 rounded font-bold hover:from-sky-400 hover:to-cyan-400 transition"
        title="تبديل التقويم"
      >
        {calendarType === 'gregorian' ? '📅 ميلادي' : '🌙 هجري'}
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
