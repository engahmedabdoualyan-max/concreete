import { useNavigate } from 'react-router-dom';
import { useDate, formatDate } from '../context/DateContext';

const PAGES = [
  { path: '/', label: '🏠 Dashboard' },
  { path: '/operations', label: '🚚 Operations Tracker' },
  { path: '/workshop', label: '🔧 Workshop / Maintenance' },
  { path: '/mixing', label: '🎛️ Mixing & Quality' },
  { path: '/production', label: '🏭 Production & Inventory' },
  { path: '/evaluation', label: '📊 Plant OEE Evaluation' },
  { path: '/schedule', label: '📅 Pouring Schedule' },
  { path: '/orders', label: '📦 Orders' },
  { path: '/rnd', label: '🔬 R&D' },
  { path: '/governance', label: '🛡️ Governance: Weighbridge & Returns' },
  { path: '/finance', label: '💰 Finance: Payments & Reorder' },
  { path: '/multiplant', label: '🏭 Multi-Plant Command Center' },
];

export default function QuickJump() {
  const navigate = useNavigate();
  const { calendarType, toggleCalendar } = useDate();
  const today = formatDate(new Date(), calendarType);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        onChange={(e) => { if (e.target.value) navigate(e.target.value); }}
        className="bg-white/[0.04] text-slate-300 text-xs border border-white/10 px-2 py-1.5 rounded hover:text-white cursor-pointer outline-none"
        defaultValue=""
      >
        <option value="">🚀 Quick Jump...</option>
        {PAGES.map(p => (
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
    </div>
  );
}
