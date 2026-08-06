import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DatePicker from '../components/DatePicker';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';

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
  const { currentUser } = useAuth();
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

  // ============ Load Data ============
  useEffect(() => {
    if (!currentUser) return;

    // Load trips
    const tripsData = localStorage.getItem('trips_data') || localStorage.getItem('trips');
    if (tripsData) setTrips(JSON.parse(tripsData));

    // Load orders
    const ordersData = localStorage.getItem('concrete_plant_orders');
    if (ordersData) setOrders(JSON.parse(ordersData));

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

  // 1. Mixing Stations Rating
  const mixingStationsRating = useMemo(() => {
    if (stations.length === 0) return { score: 0, details: 'لا توجد بيانات', maxScore: 100 };

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
      details: `الكفاءة: ${avgEfficiency.toFixed(1)}% | التوفر: ${stationAvailability.toFixed(1)}% (${activeStations}/${stations.length} محطة)`,
      maxScore: 100
    };
  }, [stations]);

  // 2. Mixer Trucks Rating
  const mixerTrucksRating = useMemo(() => {
    if (filteredTrips.length === 0) return { score: 0, details: 'لا توجد رحلات', maxScore: 100 };

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
      details: `الإنجاز: ${qtyAchievement.toFixed(1)}% | معدل الإكمال: ${completionRate.toFixed(1)}% | المتوسط: ${avgDailyQty.toFixed(0)} م³/يوم`,
      maxScore: 100
    };
  }, [filteredTrips, daysCount]);

  // 3. Pumps Rating (مع حساب أوقات الانتظار وأسباب التأخير)
  const pumpsRating = useMemo(() => {
    if (filteredTrips.length === 0) return { score: 0, details: 'لا توجد بيانات', maxScore: 100 };

    const tripsWithPump = filteredTrips.filter(t => t.pump && t.pump !== '--');
    if (tripsWithPump.length === 0) return { score: 0, details: 'لا توجد رحلات بمضخات', maxScore: 100 };

    // حساب إحصائيات المضخات
    const pumpStats: Record<string, { trips: number; qty: number; delays: number; waitingTime: number }> = {};
    tripsWithPump.forEach(t => {
      if (!pumpStats[t.pump]) pumpStats[t.pump] = { trips: 0, qty: 0, delays: 0, waitingTime: 0 };
      pumpStats[t.pump].trips++;
      pumpStats[t.pump].qty += t.qty || 0;
      
      // حساب وقت الانتظار
      if (t.pumpArrivalTime && t.pourStartTime && t.pumpArrivalTime !== '00:00' && t.pourStartTime !== '00:00') {
        const arrTime = t.pumpArrivalTime.split(':');
        const pourTime = t.pourStartTime.split(':');
        const arrMinutes = parseInt(arrTime[0]) * 60 + parseInt(arrTime[1]);
        const pourMinutes = parseInt(pourTime[0]) * 60 + parseInt(pourTime[1]);
        const waitMinutes = pourMinutes - arrMinutes;
        if (waitMinutes > 0) {
          pumpStats[t.pump].waitingTime += waitMinutes;
        }
      }
      
      // حساب عدد التأخيرات
      if (t.delayReason && t.delayReason !== 'ready') {
        pumpStats[t.pump].delays++;
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
    tripsWithPump.forEach(t => {
      if (t.delayReason && t.delayReason !== 'ready') {
        const reason = t.delayReason === 'site_not_ready' ? 'عدم جاهزية الموقع' :
                      t.delayReason === 'breakdown' ? 'عطل فني' :
                      t.delayReason === 'emergency' ? 'أمر طارئ' : 'أسباب أخرى';
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
    const delayReasonText = topDelayReason ? ` | السبب الرئيسي: ${topDelayReason[0]} (${topDelayReason[1]})` : '';

    return {
      score: Math.round(finalScore),
      details: `عدد المضخات: ${pumpCount} | متوسط الرحلات: ${avgTripsPerPump.toFixed(1)} | متوسط الكمية: ${avgQtyPerPump.toFixed(0)} م³ | متوسط الانتظار: ${avgWaitingTime.toFixed(0)} دقيقة | نسبة التأخير: ${delayRate.toFixed(1)}%${delayReasonText}`,
      maxScore: 100
    };
  }, [filteredTrips, daysCount]);

  // 4. Workshop Rating
  const workshopRating = useMemo(() => {
    if (filteredBreakdowns.length === 0 && breakdowns.length === 0) return { score: 100, details: 'لا توجد أعطال', maxScore: 100 };

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
      details: `معدل الحل: ${resolutionRate.toFixed(1)}% | أعطال مفتوحة: ${openBreakdowns} | متوسط تكلفة العطل: $${avgCostPerBreakdown.toFixed(0)}`,
      maxScore: 100
    };
  }, [filteredBreakdowns, breakdowns]);

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
      details: `الكمية المباعة: ${totalQty.toFixed(0)} م³ | المتوسط اليومي: ${avgDailyQty.toFixed(0)} م³ | الهدف: ${targetDaily.toFixed(0)} م³/يوم`,
      maxScore: 100
    };
  }, [filteredTrips, stations, daysCount]);

  // 6. Orders Rating
  const ordersRating = useMemo(() => {
    if (filteredOrders.length === 0) return { score: 0, details: 'لا توجد طلبات', maxScore: 100 };

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
      details: `إجمالي الطلبات: ${totalOrders} | مكتملة: ${completedOrders} | مجدولة: ${scheduledOrders} | ملغاة: ${cancelledOrders} | موافقة: ${approvalRate.toFixed(1)}%`,
      maxScore: 100
    };
  }, [filteredOrders]);

  // ============ Final Rating ============
  const finalRating = useMemo(() => {
    const ratings = [
      mixingStationsRating.score,
      mixerTrucksRating.score,
      pumpsRating.score,
      workshopRating.score,
      salesRating.score,
      ordersRating.score
    ].filter(score => score > 0); // Exclude sections with no data

    if (ratings.length === 0) return 0;

    return Math.round(ratings.reduce((sum, score) => sum + score, 0) / ratings.length);
  }, [mixingStationsRating, mixerTrucksRating, pumpsRating, workshopRating, salesRating, ordersRating]);

  const getRatingColor = (score: number): string => {
    if (score >= 85) return 'text-emerald-400';
    if (score >= 70) return 'text-blue-400';
    if (score >= 55) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getRatingLabel = (score: number): string => {
    if (score >= 85) return 'ممتاز';
    if (score >= 70) return 'جيد جداً';
    if (score >= 55) return 'جيد';
    if (score >= 40) return 'مقبول';
    return 'ضعيف';
  };

  const getProgressColor = (score: number): string => {
    if (score >= 85) return 'bg-emerald-500';
    if (score >= 70) return 'bg-blue-500';
    if (score >= 55) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // ============ Rating Sections ============
  const ratingSections: RatingSection[] = [
    {
      name: 'محطات الخلط',
      icon: '🏭',
      score: mixingStationsRating.score,
      maxScore: mixingStationsRating.maxScore,
      details: mixingStationsRating.details,
      color: 'border-blue-500'
    },
    {
      name: 'السيارات الخلاطة',
      icon: '🚛',
      score: mixerTrucksRating.score,
      maxScore: mixerTrucksRating.maxScore,
      details: mixerTrucksRating.details,
      color: 'border-green-500'
    },
    {
      name: 'المضخات',
      icon: '🚰',
      score: pumpsRating.score,
      maxScore: pumpsRating.maxScore,
      details: pumpsRating.details,
      color: 'border-purple-500'
    },
    {
      name: 'الورشة',
      icon: '🔧',
      score: workshopRating.score,
      maxScore: workshopRating.maxScore,
      details: workshopRating.details,
      color: 'border-orange-500'
    },
    {
      name: 'المبيعات',
      icon: '💰',
      score: salesRating.score,
      maxScore: salesRating.maxScore,
      details: salesRating.details,
      color: 'border-emerald-500'
    },
    {
      name: 'الطلبات',
      icon: '📦',
      score: ordersRating.score,
      maxScore: ordersRating.maxScore,
      details: ordersRating.details,
      color: 'border-cyan-500'
    }
  ];

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">🔒 Access Denied</p>
          <Link to="/" className="text-blue-400 underline">Back to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#0f1729] to-[#1a2332] border-b border-[#2a3a5c] px-6 py-2.5 flex justify-between items-center sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-slate-400 text-xs border border-[#2a3a5c] px-2 py-1 rounded hover:text-white">← Dashboard</Link>
          <QuickJump />
          <LangSelector />
          <h1 className="text-sm font-bold text-white">📊 التقييم العام للمصنع</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <p className="text-[10px] text-emerald-500/80">د. أحمد عبده عليان</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {/* Date Filter */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-4 mb-6">
          <h3 className="text-sm font-bold text-white mb-3">📅 فترة التقييم</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DatePicker
              value={fromDate}
              onChange={setFromDate}
              label="من تاريخ"
            />
            <DatePicker
              value={toDate}
              onChange={setToDate}
              label="إلى تاريخ"
            />
          </div>
          <div className="mt-3 text-xs text-slate-400">
            📊 عدد الأيام: <span className="text-white font-bold">{daysCount}</span> يوم
          </div>
        </div>

        {/* Final Rating */}
        <div className="bg-gradient-to-br from-[#1e293b] to-[#0f172a] border-2 border-[#334155] rounded-xl p-8 mb-6 text-center">
          <h2 className="text-xl font-bold text-white mb-4">🏆 التقييم النهائي لأداء المصنع</h2>
          <div className="relative inline-block">
            <div className={`text-7xl font-black ${getRatingColor(finalRating)}`}>
              {finalRating}
            </div>
            <div className="text-lg text-slate-400 mt-2">/ 100</div>
          </div>
          <div className={`text-2xl font-bold mt-4 ${getRatingColor(finalRating)}`}>
            {getRatingLabel(finalRating)}
          </div>
          <div className="mt-6 max-w-2xl mx-auto">
            <div className="h-4 bg-[#334155] rounded-full overflow-hidden">
              <div
                className={`h-full ${getProgressColor(finalRating)} transition-all duration-1000`}
                style={{ width: `${finalRating}%` }}
              />
            </div>
          </div>
        </div>

        {/* Rating Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {ratingSections.map((section, index) => (
            <div
              key={index}
              className={`bg-[#1e293b] border-l-4 ${section.color} rounded-xl p-5 hover:scale-105 transition-transform`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-2xl">{section.icon}</span>
                  {section.name}
                </h3>
                <div className={`text-3xl font-black ${getRatingColor(section.score)}`}>
                  {section.score}
                </div>
              </div>

              <div className="mb-3">
                <div className="h-2 bg-[#334155] rounded-full overflow-hidden">
                  <div
                    className={`h-full ${getProgressColor(section.score)} transition-all duration-500`}
                    style={{ width: `${section.score}%` }}
                  />
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                {section.details}
              </p>

              <div className="mt-3 pt-3 border-t border-[#334155]">
                <span className={`text-xs font-bold ${getRatingColor(section.score)}`}>
                  {getRatingLabel(section.score)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">📈 ملخص الإحصائيات</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#0f172a] rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">إجمالي الرحلات</p>
              <p className="text-2xl font-bold text-white">{filteredTrips.length}</p>
            </div>
            <div className="bg-[#0f172a] rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">إجمالي الكمية</p>
              <p className="text-2xl font-bold text-emerald-400">
                {filteredTrips.reduce((s, t) => s + (t.qty || 0), 0).toFixed(0)} م³
              </p>
            </div>
            <div className="bg-[#0f172a] rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">إجمالي الطلبات</p>
              <p className="text-2xl font-bold text-blue-400">{filteredOrders.length}</p>
            </div>
            <div className="bg-[#0f172a] rounded-lg p-4">
              <p className="text-xs text-slate-400 mb-1">الأعطال</p>
              <p className="text-2xl font-bold text-red-400">
                {filteredBreakdowns.filter(b => b.status !== 'Resolved').length}
              </p>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6 mt-6">
          <h3 className="text-lg font-bold text-blue-400 mb-4">💡 التوصيات</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            {mixingStationsRating.score < 70 && (
              <li>⚠️ <strong>محطات الخلط:</strong> يجب تحسين الكفاءة التشغيلية للمحطات</li>
            )}
            {mixerTrucksRating.score < 70 && (
              <li>⚠️ <strong>السيارات الخلاطة:</strong> زيادة عدد الرحلات اليومية وتحسين الجدولة</li>
            )}
            {pumpsRating.score < 70 && (
              <li>⚠️ <strong>المضخات:</strong> تحسين توزيع المضخات وزيادة استخدامها</li>
            )}
            {workshopRating.score < 70 && (
              <li>⚠️ <strong>الورشة:</strong> تسريع إصلاح الأعطال وتقليل التكاليف</li>
            )}
            {salesRating.score < 70 && (
              <li>⚠️ <strong>المبيعات:</strong> زيادة حجم المبيعات اليومية للوصول للهدف</li>
            )}
            {ordersRating.score < 70 && (
              <li>⚠️ <strong>الطلبات:</strong> تحسين معدل إكمال الطلبات وتقليل الإلغاءات</li>
            )}
            {finalRating >= 85 && (
              <li>✅ <strong>أداء ممتاز!</strong> استمر في الحفاظ على هذا المستوى العالي</li>
            )}
          </ul>
        </div>

        {/* Print Button */}
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => window.print()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg"
          >
            🖨️ طباعة التقرير
          </button>
        </div>
      </div>
    </div>
  );
}
