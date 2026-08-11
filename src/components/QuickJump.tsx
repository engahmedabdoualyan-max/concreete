import { useNavigate } from 'react-router-dom';
import { useDate, formatDate } from '../context/DateContext';
import { useLang } from '../context/LangContext';
import type { Translations } from '../context/translations';

const PAGES: { path: string; key: keyof Translations; emoji: string }[] = [
  { path: '/', key: 'dashboard', emoji: '🏠' },
  { path: '/operations', key: 'operationsTracker', emoji: '🚚' },
  { path: '/workshop', key: 'workshopMaintenance', emoji: '🔧' },
  { path: '/mixing', key: 'mixingQuality', emoji: '🎛️' },
  { path: '/production', key: 'productionInventory', emoji: '🏭' },
  { path: '/evaluation', key: 'plantOeeEvaluation', emoji: '📊' },
  { path: '/schedule', key: 'pouringSchedule', emoji: '📅' },
  { path: '/orders', key: 'modOrders', emoji: '📦' },
  { path: '/rnd', key: 'modRnd', emoji: '🔬' },
  { path: '/governance', key: 'governanceWeighbridgeReturns', emoji: '🛡️' },
  { path: '/finance', key: 'financePaymentsReorder', emoji: '💰' },
  { path: '/multiplant', key: 'multiPlantCommandCenter', emoji: '🏭' },
];

export default function QuickJump() {
  const navigate = useNavigate();
  const { t } = useLang();
  const { calendarType, toggleCalendar } = useDate();
  const today = formatDate(new Date(), calendarType);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        onChange={(e) => { if (e.target.value) navigate(e.target.value); }}
        className="bg-white/[0.04] text-slate-300 text-xs border border-white/10 px-2 py-1.5 rounded hover:text-white cursor-pointer outline-none"
        defaultValue=""
      >
        <option value="">🚀 {t('quickJump')}...</option>
        {PAGES.map(p => (
          <option key={p.path} value={p.path}>{p.emoji} {t(p.key)}</option>
        ))}
      </select>
      <button
        onClick={toggleCalendar}
        className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs px-3 py-1.5 rounded font-bold hover:from-sky-400 hover:to-cyan-400 transition"
        title={t('toggleCalendar')}
      >
        {calendarType === 'gregorian' ? `📅 ${t('gregorian')}` : `🌙 ${t('hijri')}`}
      </button>
      <span className="text-[10px] text-slate-400 font-mono bg-white/[0.04] px-2 py-1 rounded border border-white/10">
        {today}
      </span>
    </div>
  );
}
