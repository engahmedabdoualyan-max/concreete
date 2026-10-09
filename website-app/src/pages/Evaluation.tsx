import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadOrders, loadTrips } from '../firebase/firestore';
import { api, ApiError } from '../api/client';
import DatePicker from '../components/DatePicker';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import { useEvaluationDict } from '../i18n/evaluationDict';

// ============ Interfaces ============
interface Trip {
  id: number;
  plant: string;
  date: string;
  code: string;
  driver: string;
  qty: number;
  pump: string;
  stationArr: string;
  stationDep: string;
  siteArr: string;
  siteDep: string;
  status: string;
  // أوقات البامب الجديدة
  pumpDepartureTime?: string;
  pumpArrivalTime?: string;
  pourStartTime?: string;
  delayReason?: 'ready' | 'site_not_ready' | 'breakdown' | 'emergency' | 'other';
  delayDetails?: string;
}

interface Order {
  id: string;
  orderDate: string;
  orderTime: string;
  customerName: string;
  projectName: string;
  orderType: 'concrete' | 'blocks';
  quantity: number;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  accountStatus: 'approved' | 'pending' | 'rejected';
  debtStatus: 'clear' | 'has_debt' | 'blocked';
}

interface MixingStation {
  id: number;
  name: string;
  type: 'Concrete' | 'Block' | 'Both';
  designCap: number;
  actualCap: number;
  status: 'Running' | 'Maintenance' | 'Stopped';
}

interface Breakdown {
  id: number;
  date: string;
  assetId: string;
  status: 'Open' | 'In Repair' | 'Resolved';
  repairCost: number;
}

interface RatingSection {
  name: string;
  icon: string;
  score: number;
  maxScore: number;
  details: string;
  color: string;
}

// ============ Helper Functions ============
const getDaysBetween = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1); // +1 to include both start and end dates
};

const filterByDate = <T extends { date?: string; orderDate?: string }>(items: T[], fromDate: string, toDate: string): T[] => {
  return items.filter(item => {
    const date = item.date || item.orderDate || '';
    if (!date) return false;
    if (fromDate && date < fromDate) return false;
    if (toDate && date > toDate) return false;
    return true;
  });
};

export default function Evaluation() {
  const { currentUser, logout } = useAuth();
  const { lang } = useLang();
  const ar = lang === 'ar';
  const L = (a: string, e: string) => (ar ? a : e);
  const navigate = useNavigate();
  const t = useEvaluationDict();
  const [fromDate, setFromDate] = useState(() => {
    const today = new Date();
    const monthAgo = new Date(today);
    monthAgo.setMonth(today.getMonth() - 1);
    return monthAgo.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);

  // ============ Data States ============
  const [trips, setTrips] = useState<Trip[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stations, setStations] = useState<MixingStation[]>([]);
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([]);

  // ============ Central API: live evaluation (GET) + snapshot (POST) ============
  // Local computed sections below stay as the offline fallback; this panel is
  // the server-side rating from Postgres (GET /api/evaluation, POST to persist).
  interface ServerEvaluation {
    overallScore: number;
    grade: string;
    scores: Record<string, number>;
    recommendations: unknown[];
    evaluatedAt: string;
  }
  const [serverEval, setServerEval] = useState<ServerEvaluation | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);
  const [snapshotSaving, setSnapshotSaving] = useState(false);

  // ============ Load Data ============
  useEffect(() => {
    if (!currentUser) return;

    // Load trips
    loadTrips(currentUser.username).then(fbTrips => {
      if (Array.isArray(fbTrips) && fbTrips.length) setTrips(fbTrips);
      else {
        const tripsData = localStorage.getItem('trips_data') || localStorage.getItem('trips');
        if (tripsData) setTrips(JSON.parse(tripsData));
      }
    }).catch(() => {
      const tripsData = localStorage.getItem('trips_data') || localStorage.getItem('trips');
      if (tripsData) setTrips(JSON.parse(tripsData));
    });

    // Load orders
    loadOrders(currentUser.username).then(fbOrders => {
      if (Array.isArray(fbOrders) && fbOrders.length) setOrders(fbOrders);
      else {
        const ordersData = localStorage.getItem('concrete_plant_orders');
        if (ordersData) setOrders(JSON.parse(ordersData));
      }
    }).catch(() => {
      const ordersData = localStorage.getItem('concrete_plant_orders');
      if (ordersData) setOrders(JSON.parse(ordersData));
    });

    // Load mixing stations
    const stationsData = localStorage.getItem('ws_stations');
    if (stationsData) setStations(JSON.parse(stationsData));

    // Load breakdowns
    const breakdownsData = localStorage.getItem('ws_breakdowns');
    if (breakdownsData) setBreakdowns(JSON.parse(breakdownsData));
  }, [currentUser]);

  // ============ Filtered Data ============
  const filteredTrips = useMemo(() => filterByDate(trips, fromDate, toDate), [trips, fromDate, toDate]);
  const filteredOrders = useMemo(() => filterByDate(orders, fromDate, toDate), [orders, fromDate, toDate]);
  const filteredBreakdowns = useMemo(() => filterByDate(breakdowns, fromDate, toDate), [breakdowns, fromDate, toDate]);

  // ============ Calculations ============
  const daysCount = getDaysBetween(fromDate, toDate);

  // Rolling analysis window for the central API (1–168h), derived from the
  // selected period. POST /api/evaluation takes only this optional field,
  // so no extra inputs are needed.
  const windowHours = Math.min(168, Math.max(1, daysCount * 24));

  const refreshServerEval = () => {
    setServerLoading(true);
    setServerError(null);
    api.get<{ evaluation: ServerEvaluation }>(`/api/evaluation?windowHours=${windowHours}`)
      .then(d => setServerEval(d.evaluation))
      .catch((e: unknown) => setServerError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setServerLoading(false));
  };

  const saveSnapshot = () => {
    setSnapshotSaving(true);
    setSnapshotMsg(null);
    api.post<{ evaluation: ServerEvaluation }>('/api/evaluation', { windowHours })
      .then(d => {
        setServerEval(d.evaluation);
        setSnapshotMsg(`✅ تم حفظ اللقطة — التقييم: ${d.evaluation.overallScore}/100 (${d.evaluation.grade})`);
      })
      .catch((e: unknown) => setSnapshotMsg(e instanceof ApiError ? `❌ ${e.message}` : `❌ ${String(e)}`))
      .finally(() => setSnapshotSaving(false));
  };

  useEffect(() => {
    refreshServerEval();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowHours]);

  // 1. Mixing Stations Rating
  const mixingStationsRating = useMemo(() => {
    if (stations.length === 0) return { score: 0, details: t('noData'), maxScore: 100 };

    let totalScore = 0;
    let activeStations = 0;

    stations.forEach(station => {
      if (station.status === 'Running') {
        activeStations++;
        const efficiency = (station.actualCap / station.designCap) * 100;
        totalScore += Math.min(efficiency, 100);
      }
    });

    const avgEfficiency = activeStations > 0 ? totalScore / activeStations : 0;
    const stationAvailability = (activeStations / stations.length) * 100;

    const finalScore = (avgEfficiency * 0.7) + (stationAvailability * 0.3);

    return {
      score: Math.round(finalScore),
      details: `${t('effPrefix')}${avgEfficiency.toFixed(1)}%${t('availPipe')}${stationAvailability.toFixed(1)}% (${activeStations}/${stations.length}${t('stationUnit')})`,
      maxScore: 100
    };
  }, [stations, t]);

  // 2. Mixer Trucks Rating
  const mixerTrucksRating = useMemo(() => {
    if (filteredTrips.length === 0) return { score: 0, details: t('noTrips'), maxScore: 100 };

    const totalQty = filteredTrips.reduce((sum, t) => sum + (t.qty || 0), 0);
    const avgDailyQty = totalQty / daysCount;
    const targetDaily = 1000; // م³ في اليوم

    // Completion rate
    const completedTrips = filteredTrips.filter(t => t.status === 'COMPLETED').length;
    const completionRate = (completedTrips / filteredTrips.length) * 100;

    // Quantity achievement
    const qtyAchievement = Math.min((avgDailyQty / targetDaily) * 100, 100);

    const finalScore = (completionRate * 0.5) + (qtyAchievement * 0.5);

    return {
      score: Math.round(finalScore),
      details: `${t('achPrefix')}${qtyAchievement.toFixed(1)}%${t('completionPipe')}${completionRate.toFixed(1)}%${t('avgPipe')}${avgDailyQty.toFixed(0)}${t('m3')}${t('perDay')}`,
      maxScore: 100
    };
  }, [filteredTrips, daysCount, t]);

  // 3. Pumps Rating (مع حساب أوقات الانتظار وأسباب التأخير)
  const pumpsRating = useMemo(() => {
    if (filteredTrips.length === 0) return { score: 0, details: t('noData'), maxScore: 100 };

    const tripsWithPump = filteredTrips.filter(t => t.pump && t.pump !== '--');
    if (tripsWithPump.length === 0) return { score: 0, details: t('noPumpTrips'), maxScore: 100 };

    // حساب إحصائيات المضخات
    const pumpStats: Record<string, { trips: number; qty: number; delays: number; waitingTime: number }> = {};
    tripsWithPump.forEach(tr => {
      if (!pumpStats[tr.pump]) pumpStats[tr.pump] = { trips: 0, qty: 0, delays: 0, waitingTime: 0 };
      pumpStats[tr.pump].trips++;
      pumpStats[tr.pump].qty += tr.qty || 0;
      
      // حساب وقت الانتظار
      if (tr.pumpArrivalTime && tr.pourStartTime && tr.pumpArrivalTime !== '00:00' && tr.pourStartTime !== '00:00') {
        const arrTime = tr.pumpArrivalTime.split(':');
        const pourTime = tr.pourStartTime.split(':');
        const arrMinutes = parseInt(arrTime[0]) * 60 + parseInt(arrTime[1]);
        const pourMinutes = parseInt(pourTime[0]) * 60 + parseInt(pourTime[1]);
        const waitMinutes = pourMinutes - arrMinutes;
        if (waitMinutes > 0) {
          pumpStats[tr.pump].waitingTime += waitMinutes;
        }
      }
      
      // حساب عدد التأخيرات
      if (tr.delayReason && tr.delayReason !== 'ready') {
        pumpStats[tr.pump].delays++;
      }
    });

    const pumpCount = Object.keys(pumpStats).length;
    const avgTripsPerPump = tripsWithPump.length / pumpCount;
    const avgQtyPerPump = tripsWithPump.reduce((s, t) => s + (t.qty || 0), 0) / pumpCount;
    
    // حساب متوسط وقت الانتظار
    const totalWaitingTime = Object.values(pumpStats).reduce((s, p) => s + p.waitingTime, 0);
    const avgWaitingTime = totalWaitingTime / tripsWithPump.length;
    
    // حساب نسبة التأخيرات
    const totalDelays = Object.values(pumpStats).reduce((s, p) => s + p.delays, 0);
    const delayRate = (totalDelays / tripsWithPump.length) * 100;
    
    // تصنيف أسباب التأخير
    const delayReasons: Record<string, number> = {};
    tripsWithPump.forEach(tr => {
      if (tr.delayReason && tr.delayReason !== 'ready') {
        const reason = tr.delayReason === 'site_not_ready' ? t('reasonSite') :
                      tr.delayReason === 'breakdown' ? t('reasonBreakdown') :
                      tr.delayReason === 'emergency' ? t('reasonEmergency') : t('reasonOther');

        delayReasons[reason] = (delayReasons[reason] || 0) + 1;
      }
    });

    // Target: 20 trips per pump, 200 m³ per pump in period
    const targetTrips = 20 * daysCount;
    const targetQty = 200 * daysCount;

    const tripEfficiency = Math.min((avgTripsPerPump / targetTrips) * 100, 100);
    const qtyEfficiency = Math.min((avgQtyPerPump / targetQty) * 100, 100);
    
    // عقوبة وقت الانتظار (كل 30 دقيقة انتظار = -5 نقاط)
    const waitingPenalty = Math.min((avgWaitingTime / 30) * 5, 30);
    
    // عقوبة التأخيرات (كل 10% تأخير = -5 نقاط)
    const delayPenalty = Math.min((delayRate / 10) * 5, 20);

    const finalScore = Math.max(0, (tripEfficiency * 0.4) + (qtyEfficiency * 0.4) + (100 - waitingPenalty - delayPenalty) * 0.2);

    const topDelayReason = Object.entries(delayReasons).sort((a, b) => b[1] - a[1])[0];
    const delayReasonText = topDelayReason ? `${t('mainReasonPipe')}${topDelayReason[0]} (${topDelayReason[1]})` : '';

    return {
      score: Math.round(finalScore),
      details: `${t('pumpsCount')}${pumpCount}${t('avgTripsPipe')}${avgTripsPerPump.toFixed(1)}${t('avgQtyPipe')}${avgQtyPerPump.toFixed(0)}${t('m3')}${t('avgWaitPipe')}${avgWaitingTime.toFixed(0)}${t('waitMin')}${t('delayPipe')}${delayRate.toFixed(1)}${t('percent')}${delayReasonText}`,
      maxScore: 100
    };
  }, [filteredTrips, daysCount, t]);

  // 4. Workshop Rating
  const workshopRating = useMemo(() => {
    if (filteredBreakdowns.length === 0 && breakdowns.length === 0) return { score: 0, details: t('noBreakdowns'), maxScore: 100, hasData: false };

    const totalBreakdowns = filteredBreakdowns.length;
    const resolvedBreakdowns = filteredBreakdowns.filter(b => b.status === 'Resolved').length;
    const openBreakdowns = totalBreakdowns - resolvedBreakdowns;

    const resolutionRate = totalBreakdowns > 0 ? (resolvedBreakdowns / totalBreakdowns) * 100 : 100;

    // Penalty for open breakdowns
    const openPenalty = Math.min(openBreakdowns * 5, 30); // -5 points per open breakdown, max -30

    const totalRepairCost = filteredBreakdowns.reduce((sum, b) => sum + (b.repairCost || 0), 0);
    const avgCostPerBreakdown = totalBreakdowns > 0 ? totalRepairCost / totalBreakdowns : 0;

    // Cost efficiency (lower is better, target: <1000 per breakdown)
    const costScore = Math.max(0, 100 - (avgCostPerBreakdown / 10));

    const finalScore = Math.max(0, (resolutionRate * 0.6) + (costScore * 0.4) - openPenalty);

    return {
      score: Math.round(finalScore),
      details: `${t('resolPrefix')}${resolutionRate.toFixed(1)}${t('percent')}${t('openPipe')}${openBreakdowns}${t('costPipe')}${avgCostPerBreakdown.toFixed(0)}`,
      maxScore: 100
    };
  }, [filteredBreakdowns, breakdowns, t]);

  // 5. Sales Rating
  const salesRating = useMemo(() => {
    const concreteTrips = filteredTrips.filter(t => t.qty > 0);
    const totalQty = concreteTrips.reduce((sum, t) => sum + (t.qty || 0), 0);
    const avgDailyQty = totalQty / daysCount;

    // Target: 1000 m³ per day OR from mixing stations
    let targetDaily = 1000;

    if (stations.length > 0) {
      const totalDesignCap = stations
        .filter(s => s.type === 'Concrete' || s.type === 'Both')
        .reduce((sum, s) => sum + s.designCap, 0);

      // Assume 8 working hours per day
      targetDaily = Math.max(1000, totalDesignCap * 8);
    }

    const achievement = Math.min((avgDailyQty / targetDaily) * 100, 150);
    const finalScore = Math.min(achievement, 100);

    return {
      score: Math.round(finalScore),
      details: `${t('soldPrefix')}${totalQty.toFixed(0)}${t('m3')}${t('avgDailyPipe')}${avgDailyQty.toFixed(0)}${t('m3')}${t('targetPipe')}${targetDaily.toFixed(0)}${t('m3')}${t('perDay')}`,
      maxScore: 100
    };
  }, [filteredTrips, stations, daysCount, t]);

  // 6. Orders Rating
  const ordersRating = useMemo(() => {
    if (filteredOrders.length === 0) return { score: 0, details: t('noOrders'), maxScore: 100 };

    const totalOrders = filteredOrders.length;
    const completedOrders = filteredOrders.filter(o => o.status === 'completed').length;
    const scheduledOrders = filteredOrders.filter(o => o.status === 'scheduled').length;
    const cancelledOrders = filteredOrders.filter(o => o.status === 'cancelled').length;

    const completionRate = (completedOrders / totalOrders) * 100;
    const scheduledRate = (scheduledOrders / totalOrders) * 100;
    const cancellationRate = (cancelledOrders / totalOrders) * 100;

    // Approved orders
    const approvedOrders = filteredOrders.filter(o => o.accountStatus === 'approved').length;
    const approvalRate = (approvedOrders / totalOrders) * 100;

    const finalScore = (completionRate * 0.4) + (scheduledRate * 0.3) + (approvalRate * 0.3) - (cancellationRate * 0.2);

    return {
      score: Math.round(Math.max(0, finalScore)),
      details: `${t('totalPipe')}${totalOrders}${t('completedPipe')}${completedOrders}${t('scheduledPipe')}${scheduledOrders}${t('cancelledPipe')}${cancelledOrders}${t('approvalPipe')}${approvalRate.toFixed(1)}${t('percent')}`,
      maxScore: 100
    };
  }, [filteredOrders, t]);


  const getRatingColor = (score: number): string => {
    if (score >= 85) return 'text-emerald-400';
    if (score >= 70) return 'text-sky-400';
    if (score >= 55) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRatingLabel = (score: number): string => {
    if (score >= 85) return 'rlExcellent';
    if (score >= 70) return 'rlVeryGood';
    if (score >= 55) return 'rlGood';
    if (score >= 40) return 'rlAcceptable';
    return 'rlWeak';
  };

  const getProgressColor = (score: number): string => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-sky-500';
    if (score >= 55) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // ============ Rating Sections (real data only — no data means no rating) ============
  const hasTrips = filteredTrips.length > 0;
  const ratingSections: (RatingSection & { hasData: boolean })[] = [
    {
      name: 'secMixing',
      icon: '🏭',
      score: mixingStationsRating.score,
      maxScore: mixingStationsRating.maxScore,
      details: mixingStationsRating.details,
      color: 'border-sky-500',
      hasData: stations.length > 0 && hasTrips,
    },
    {
      name: 'secTrucks',
      icon: '🚛',
      score: mixerTrucksRating.score,
      maxScore: mixerTrucksRating.maxScore,
      details: mixerTrucksRating.details,
      color: 'border-green-500',
      hasData: hasTrips,
    },
    {
      name: 'secPumps',
      icon: '🚰',
      score: pumpsRating.score,
      maxScore: pumpsRating.maxScore,
      details: pumpsRating.details,
      color: 'border-sky-500',
      hasData: hasTrips,
    },
    {
      name: 'secWorkshop',
      icon: '🔧',
      score: workshopRating.score,
      maxScore: workshopRating.maxScore,
      details: workshopRating.details,
      color: 'border-orange-500',
      hasData: (workshopRating as any).hasData !== false && breakdowns.length > 0,
    },
    {
      name: 'secSales',
      icon: '💰',
      score: salesRating.score,
      maxScore: salesRating.maxScore,
      details: salesRating.details,
      color: 'border-emerald-500',
      hasData: hasTrips,
    },
    {
      name: 'secOrders',
      icon: '📦',
      score: ordersRating.score,
      maxScore: ordersRating.maxScore,
      details: ordersRating.details,
      color: 'border-cyan-500',
      hasData: filteredOrders.length > 0,
    }
  ];

  // ============ Final Rating (real data only) ============
  const finalRating = useMemo(() => {
    const rated = ratingSections.filter((s) => s.hasData && s.score > 0);
    if (rated.length === 0) return null;
    return Math.round(rated.reduce((sum, s) => sum + s.score, 0) / rated.length);
  }, [ratingSections]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">🔒 Access Denied</p>
          <Link to="/" className="text-sky-400 underline">{L('عودة للدخول', 'Back to Login')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      {/* Header */}
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump />
          <LangSelector />
          <h1 className="text-sm font-bold text-white">{t('evalTitle')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">{t('logout')}</button>
          <p className="text-[10px] text-emerald-500/80">د. أحمد عبده عليان</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Date Filter */}
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mb-6 backdrop-blur-xl">
          <h3 className="text-sm font-bold text-white mb-3">{t('evalPeriod')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              label={t('fromDate')}
            />
            <DatePicker
              value={toDate}
              onChange={setToDate}
              label={t('toDate')}
            />
          </div>
          <div className="mt-3 text-xs text-slate-400">
            📊 {t('daysWord')}: <span className="text-white font-bold">{daysCount}</span> {t('day')}
          </div>
        </div>

        {/* Central API — live server evaluation (GET) + snapshot (POST) */}
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 mb-6 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="text-sm font-bold text-white">🛰️ تقييم الخادم المركزي (مباشر)</h3>
            <div className="flex gap-2">
              <button
                onClick={refreshServerEval}
                disabled={serverLoading}
                className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:text-white disabled:opacity-50"
              >
                {serverLoading ? '... جارٍ التحميل' : '🔄 تحديث'}
              </button>
              <button
                onClick={saveSnapshot}
                disabled={snapshotSaving}
                className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-50"
              >
                {snapshotSaving ? '... جارٍ الحفظ' : '💾 حفظ لقطة'}
              </button>
            </div>
          </div>
          {serverError && (
            <p className="text-xs text-red-400 mb-2">⚠️ تعذر الاتصال بالخادم: {serverError} — الأقسام أدناه محسوبة محلياً.</p>
          )}
          {serverEval && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400 mb-1">التقييم العام</p>
                <p className={`text-2xl font-bold ${getRatingColor(serverEval.overallScore)}`}>{serverEval.overallScore}</p>
                <p className="text-[10px] text-slate-500">{serverEval.grade}</p>
              </div>
              {Object.entries(serverEval.scores).map(([k, v]) => (
                <div key={k} className="bg-white/[0.02] rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-400 mb-1">{k}</p>
                  <p className={`text-2xl font-bold ${getRatingColor(v)}`}>{v}</p>
                </div>
              ))}
              <div className="bg-white/[0.02] rounded-lg p-3 text-center">
                <p className="text-xs text-slate-400 mb-1">التوصيات</p>
                <p className="text-2xl font-bold text-white">{serverEval.recommendations.length}</p>
              </div>
            </div>
          )}
          {snapshotMsg && <p className="text-xs mt-2 text-slate-300">{snapshotMsg}</p>}
        </div>

        {/* Final Rating */}
        <div className="bg-gradient-to-br from-white/[0.06] to-white/[0.02] border-2 border-white/10 rounded-xl p-8 mb-6 text-center backdrop-blur-xl">
          <h2 className="text-xl font-bold text-white mb-4">{t('finalTitle')}</h2>
          {finalRating === null ? (
            <div>
              <div className="text-3xl font-black text-slate-400">— {t('noRating')}</div>
              <p className="text-xs text-slate-500 mt-2">{t('noRatingHint')}</p>
            </div>
          ) : (
          <>
          <div className="relative inline-block">
            <div className={`text-7xl font-black ${getRatingColor(finalRating)}`}>
              {finalRating}
            </div>
            <div className="text-lg text-slate-400 mt-2">/ 100</div>
          </div>
          <div className={`text-2xl font-bold mt-4 ${getRatingColor(finalRating)}`}>
            {t(getRatingLabel(finalRating))}
          </div>
          <div className="mt-6 max-w-2xl mx-auto">
            <div className="h-4 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressColor(finalRating)} transition-all duration-1000`}
                style={{ width: `${finalRating}%` }}
              />
            </div>
          </div>
          </>
          )}
        </div>

        {/* Rating Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {ratingSections.map((section, index) => (
            <div
              key={index}
              className={`bg-white/[0.04] border-l-4 ${section.color} rounded-xl p-5 hover:scale-105 transition-transform backdrop-blur-xl`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-2xl">{section.icon}</span>
                  {t(section.name)}
                </h3>
                <div className={`text-3xl font-black ${section.hasData ? getRatingColor(section.score) : 'text-slate-500'}`}>
                  {section.hasData ? section.score : `— ${t('noRatingShort')}`}
                </div>
              </div>

              <div className="mb-3">
                <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getProgressColor(section.score)} transition-all duration-500`}
                    style={{ width: `${section.score}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {section.details}
              </p>

              <div className="mt-3 pt-3 border-t border-white/10">
                <span className={`text-xs font-bold ${getRatingColor(section.score)}`}>
                  {t(getRatingLabel(section.score))}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6 backdrop-blur-xl">
          <h3 className="text-lg font-black tracking-tight text-white mb-4">{t('summaryTitle')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/[0.02] rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">{t('totalTrips')}</p>
              <p className="text-2xl font-bold text-white">{filteredTrips.length}</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">{t('totalQty')}</p>
              <p className="text-2xl font-bold text-emerald-400">
                {filteredTrips.reduce((s, t) => s + (t.qty || 0), 0).toFixed(0)} {t('m3')}
              </p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">{t('totalOrders')}</p>
              <p className="text-2xl font-bold text-sky-400">{filteredOrders.length}</p>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">{t('breakdowns')}</p>
              <p className="text-2xl font-bold text-red-400">
                {filteredBreakdowns.filter(b => b.status !== 'Resolved').length}
              </p>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-6 mt-6">
          <h3 className="text-lg font-black tracking-tight text-sky-400 mb-4">{t('recommendations')}</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            {mixingStationsRating.score < 70 && (
              <li>⚠️ <strong>{t('secMixing')}:</strong> {t('recMixing')}</li>
            )}
            {mixerTrucksRating.score < 70 && (
              <li>⚠️ <strong>{t('secTrucks')}:</strong> {t('recTrucks')}</li>
            )}
            {pumpsRating.score < 70 && (
              <li>⚠️ <strong>{t('secPumps')}:</strong> {t('recPumps')}</li>
            )}
            {workshopRating.score < 70 && (
              <li>⚠️ <strong>{t('secWorkshop')}:</strong> {t('recWorkshop')}</li>
            )}
            {salesRating.score < 70 && (
              <li>⚠️ <strong>{t('secSales')}:</strong> {t('recSales')}</li>
            )}
            {ordersRating.score < 70 && (
              <li>⚠️ <strong>{t('secOrders')}:</strong> {t('recOrders')}</li>
            )}
            {(finalRating ?? 0) >= 85 && (
              <li>✅ <strong>{t('excellentTitle')}</strong> {t('excellentDesc')}</li>
            )}
          </ul>
        </div>

        {/* Print Button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => window.print()}
            className="bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 px-8 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]"
          >
            {t('printReport')}
          </button>
        </div>
      </div>
    </div>
  );
}
