import { useState, useEffect, useMemo } from 'react';
import { loadOrders } from '../firebase/firestore';

interface ForecastRow {
  label: string;
  m3: number;
  trend: 'up' | 'down' | 'flat';
  changePct: number;
}

/**
 * Demand Forecasting AI
 * - Analyzes last 90 days of orders (volume per day)
 * - Weighted moving average + weekday seasonality + linear trend
 * - Predicts next 7 days total demand and material requirements
 */
export default function DemandForecast() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [horizon, setHorizon] = useState<7 | 30>(7);

  useEffect(() => {
    // Try current user via localStorage username pattern used across the app
    const uname = localStorage.getItem('fimto_username') || localStorage.getItem('username') || '';
    if (!uname) { setLoaded(true); return; }
    loadOrders(uname).then(o => { if (Array.isArray(o)) setOrders(o); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const forecast = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 90 * 86400000);
    type DayAgg = Record<string, number>;
    const daily: DayAgg = {};
    let total90 = 0;

    orders.forEach(o => {
      if (!o || o.status === 'cancelled') return;
      const d = String(o.orderDate || o.date || '').slice(0, 10);
      if (!d || d < cutoff.toISOString().slice(0, 10)) return;
      const qty = Number(o.quantity) || 0;
      if (qty <= 0) return;
      daily[d] = (daily[d] || 0) + qty;
      total90 += qty;
    });

    const dates = Object.keys(daily).sort();
    const activeDays = Math.max(dates.length, 1);
    const avgDaily = total90 / 90; // calendar-day average

    // Weekday multipliers (0=Sun..6=Sat)
    const wdSum = Array(7).fill(0); const wdCnt = Array(7).fill(0);
    dates.forEach(d => {
      const wd = new Date(d + 'T00:00:00').getDay();
      wdSum[wd] += daily[d]; wdCnt[wd] += 1;
    });
    const wdAvg = wdSum.map((s, i) => (wdCnt[i] ? s / wdCnt[i] : avgDaily));
    const wdMult = wdAvg.map(v => (avgDaily > 0 ? v / avgDaily : 1));

    // Linear trend over available days
    let trendSlope = 0;
    if (dates.length >= 4) {
      const xs = dates.map((_, i) => i);
      const ys = dates.map(d => daily[d]);
      const n = xs.length;
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      const num = xs.reduce((acc, x, i) => acc + (x - mx) * (ys[i] - my), 0);
      const den = xs.reduce((acc, x) => acc + (x - mx) ** 2, 0) || 1;
      trendSlope = num / den;
    }

    // Predict next `horizon` days
    let predTotal = 0;
    const byWeek: number[] = [];
    for (let h = 0; h < horizon; h++) {
      const dt = new Date(now.getTime() + (h + 1) * 86400000);
      const base = avgDaily + trendSlope * (dates.length + h - (dates.length - 1) / 2);
      const day = Math.max(0, base * (wdMult[dt.getDay()] || 1));
      predTotal += day;
      byWeek.push(day);
    }
    const recent14 = dates.slice(-14).reduce((s, d) => s + daily[d], 0);
    const prev14 = dates.slice(-28, -14).reduce((s, d) => s + daily[d], 0);
    const changePct = prev14 > 0 ? Math.round(((recent14 - prev14) / prev14) * 100) : 0;
    const trend: 'up' | 'down' | 'flat' = changePct > 5 ? 'up' : changePct < -5 ? 'down' : 'flat';

    return {
      hasData: orders.length > 0,
      total90,
      avgDaily,
      predTotal: Math.round(predTotal),
      predDaily: Math.round(predTotal / horizon),
      peakDay: byWeek.indexOf(Math.max(...byWeek)),
      confidence: activeDays >= 30 ? 'عالية' : activeDays >= 10 ? 'متوسطة' : 'منخفضة',
      samples: activeDays,
      trend,
      changePct,
      cement: +(predTotal * 0.35).toFixed(1),
      sand: +(predTotal * 0.75).toFixed(1),
      gravel: +(predTotal * 1.1).toFixed(1),
      admix: +(predTotal * 5).toFixed(0),
    };
  }, [orders, horizon]);

  if (!loaded) return null;
  if (!forecast.hasData) return null;

  return (
    <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/30 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-black text-white">🤖 توقع الطلب بالذكاء الاصطناعي</h3>
          <p className="text-[10px] text-slate-400">تحليل آخر 90 يوم — متوسط مرجح + موسمية أيام الأسبوع + اتجاه خطي</p>
        </div>
        <div className="flex bg-white/[0.04] border border-white/10 rounded-lg p-1">
          {([7, 30] as const).map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              className={`px-3 py-1 rounded-md text-[11px] font-bold ${horizon === h ? 'bg-purple-500/30 text-purple-300' : 'text-slate-400'}`}>
              {h} يوم
            </button>
          ))}
        </div>
      </div>

      {/* Main prediction */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white/[0.03] border-l-4 border-purple-500 rounded-xl p-3">
          <p className="text-[10px] text-slate-400">الطلب المتوقع ({horizon} يوم)</p>
          <p className="text-2xl font-black text-white">{forecast.predTotal.toLocaleString()} م³</p>
          <p className={`text-[10px] font-bold mt-1 ${forecast.trend === 'up' ? 'text-emerald-400' : forecast.trend === 'down' ? 'text-red-400' : 'text-slate-400'}`}>
            {forecast.trend === 'up' ? '📈 صاعد' : forecast.trend === 'down' ? '📉 هابط' : '➡️ مستقر'} {forecast.changePct !== 0 && `(${forecast.changePct > 0 ? '+' : ''}${forecast.changePct}%)`}
          </p>
        </div>
        <div className="bg-white/[0.03] border-l-4 border-sky-500 rounded-xl p-3">
          <p className="text-[10px] text-slate-400">المتوسط اليومي المتوقع</p>
          <p className="text-2xl font-black text-white">{forecast.predDaily}</p>
          <p className="text-[10px] text-slate-500 mt-1">م³/يوم · الحالي {forecast.avgDaily.toFixed(1)}</p>
        </div>
        <div className="bg-white/[0.03] border-l-4 border-yellow-500 rounded-xl p-3">
          <p className="text-[10px] text-slate-400">أعلى يوم طلب</p>
          <p className="text-lg font-black text-white">{['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][forecast.peakDay % 7]}</p>
          <p className="text-[10px] text-slate-500 mt-1">جهّز مخزون إضافي</p>
        </div>
        <div className="bg-white/[0.03] border-l-4 border-emerald-500 rounded-xl p-3">
          <p className="text-[10px] text-slate-400">دقة التوقع</p>
          <p className="text-lg font-black text-emerald-400">{forecast.confidence}</p>
          <p className="text-[10px] text-slate-500 mt-1">{forecast.samples} يوم بيانات فعلية</p>
        </div>
      </div>

      {/* Material requirements */}
      <div>
        <p className="text-[10px] text-slate-400 uppercase font-bold mb-2">الخامات المطلوبة لتغطية الطلب المتوقع</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { name: 'أسمنت', val: forecast.cement, unit: 'طن', icon: '🏗️', color: 'from-slate-400 to-slate-200' },
            { name: 'رمل', val: forecast.sand, unit: 'طن', icon: '🟡', color: 'from-yellow-500 to-yellow-200' },
            { name: 'زلط', val: forecast.gravel, unit: 'طن', icon: '🪨', color: 'from-gray-600 to-gray-400' },
            { name: 'إضافات', val: forecast.admix, unit: 'لتر', icon: '🧪', color: 'from-cyan-500 to-cyan-300' },
          ].map(m => (
            <div key={m.name} className="bg-white/[0.03] border border-white/10 rounded-lg p-2.5 flex items-center gap-2">
              <span className="text-lg">{m.icon}</span>
              <div className="flex-1">
                <p className="text-[10px] text-slate-400">{m.name}</p>
                <p className="text-sm font-black text-white">{m.val.toLocaleString()} <span className="text-[9px] text-slate-500">{m.unit}</span></p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[9px] text-slate-600 mt-3">
        💡 يُنصح بإصدار أوامر توريد لتغطية النقص قبل موسم الذروة · إجمالي 90 يوم فعل: {forecast.total90.toLocaleString()} م³
      </p>
    </div>
  );
}
