import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadTrips, saveTrips } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import DatePicker from '../components/DatePicker';

interface Trip {
  id: number; plant: string; date: string; code: string; driver: string;
  qty: number; pump: string; estTime: number;
  stationArr: string; stationDep: string; siteArr: string; siteDep: string;
  siteName: string; projectName: string; status: string;
  siteGeo?: string; // إحداثيات الموقع الحالي (lat,lng)
  nextSiteGeo?: string; // إحداثيات الموقع التالي
  consecutiveQty?: number; // إجمالي الكمية المصبوبة في الموقع الحالي
  // أوقات البامب الجديدة
  pumpDepartureTime?: string; // وقت خروج البامب من المحطة
  pumpArrivalTime?: string; // وقت وصول البامب للموقع
  pourStartTime?: string; // وقت بداية الصب
  // سبب التأخير (إن وجد)
  delayReason?: 'ready' | 'site_not_ready' | 'breakdown' | 'emergency' | 'other';
  delayDetails?: string; // تفاصيل السبب (نص حر)
}

const DEFAULT_TRIPS: Trip[] = [
  { id: 1, plant: 'PLANT-A', date: '2026-06-18', code: 'm01', driver: 'Ahmed Ali', qty: 10, pump: 'p01', estTime: 40, stationArr: '08:00', stationDep: '08:10', siteArr: '08:50', siteDep: '09:30', siteName: 'vally damam', projectName: 'dammam 1', status: 'COMPLETED' },
  { id: 2, plant: 'PLANT-A', date: '2026-06-18', code: 'm02', driver: 'Driver-2', qty: 10, pump: 'p01', estTime: 45, stationArr: '10:00', stationDep: '10:11', siteArr: '10:56', siteDep: '11:40', siteName: '00', projectName: 'kk', status: 'COMPLETED' },
  { id: 3, plant: 'PLANT-B', date: '2026-06-18', code: 'm03', driver: 'Saeed John', qty: 10, pump: 'p02', estTime: 30, stationArr: '09:00', stationDep: '09:12', siteArr: '09:42', siteDep: '10:20', siteName: 'Khobar Site', projectName: 'Tower B', status: 'COMPLETED' },
];

function fmtTime(t: string) {
  if (!t || t === '00:00' || t === '') return '--:--';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '--:--';
  return `${h % 12 || 12}:${m < 10 ? '0' + m : m} ${h >= 12 ? 'PM' : 'AM'}`;
}
function minsDiff(a: string, b: string) {
  if (!a || !b || a === '00:00' || b === '00:00' || a === '' || b === '') return 0;
  const [h1, m1] = a.split(':').map(Number); const [h2, m2] = b.split(':').map(Number);
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0;
  let v1 = h1 * 60 + m1, v2 = h2 * 60 + m2;
  if (v2 < v1) v2 += 24 * 60;
  return v2 - v1;
}
function cleanDur(a: string, b: string) {
  if (!a || !b || a === '00:00' || b === '00:00' || a === '' || b === '') return 0;
  const raw = minsDiff(a, b);
  return raw > 180 ? Math.abs(raw - 720) : raw;
}

// Haversine formula - حساب المسافة بين نقطتين بالإحداثيات (كم)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // نصف قطر الأرض بالكم
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// تحليل إحداثيات من نص (lat, lng)
function parseGeo(geoStr: string): { lat: number; lng: number } | null {
  if (!geoStr) return null;
  const parts = geoStr.split(',').map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { lat: parts[0], lng: parts[1] };
  }
  return null;
}

// حساب إجمالي الكمية المصبوبة بواسطة مضخة معينة في موقع معين خلال اليوم
function getConsecutiveQty(trips: Trip[], pumpCode: string, siteName: string, date: string): number {
  return trips
    .filter(t => t.pump === pumpCode && t.siteName === siteName && t.date === date && t.status === 'COMPLETED')
    .reduce((sum, t) => sum + (t.qty || 0), 0);
}

const PLANT_SETTINGS: Record<string, { designCap: number; actualCap: number; mixers: number; pumps: number }> = {
  'PLANT-A': { designCap: 120, actualCap: 70, mixers: 5, pumps: 2 },
  'PLANT-B': { designCap: 120, actualCap: 70, mixers: 5, pumps: 2 },
  'ALL': { designCap: 240, actualCap: 140, mixers: 10, pumps: 4 },
};

export default function Operations() {
  const { currentUser } = useAuth();
  const [trips, setTrips] = useState<Trip[]>(DEFAULT_TRIPS);
  const [tripsLoaded, setTripsLoaded] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    loadTrips(currentUser.username).then(data => {
      if (data && Array.isArray(data) && data.length > 0) setTrips(data);
      else {
        const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
        if (saved) setTrips(JSON.parse(saved));
      }
      setTripsLoaded(true);
    }).catch(() => {
      const saved = localStorage.getItem('trips_data') || localStorage.getItem('trips');
      if (saved) setTrips(JSON.parse(saved));
      setTripsLoaded(true);
    });
  }, [currentUser?.username]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    plant: 'PLANT-A', date: '', code: '', driver: '', qty: '10', pump: 'p01', estTime: '40',
    stationArr: '', stationDep: '', siteArr: '', siteDep: '',
    siteName: '', projectName: '', status: 'COMPLETED',
    siteGeo: '', // إحداثيات الموقع الحالي
    nextSiteGeo: '', // إحداثيات الموقع التالي
    skipWash: false, // تخطي الغسيل
    // أوقات البامب الجديدة
    pumpDepartureTime: '', // وقت خروج البامب من المحطة
    pumpArrivalTime: '', // وقت وصول البامب للموقع
    pourStartTime: '', // وقت بداية الصب
    delayReason: 'ready', // سبب التأخير
    delayDetails: '', // تفاصيل السبب
    // نوع المعدة
    equipmentType: 'mixer' as 'mixer' | 'pump' | 'other', // خلاطة / بامب / أخرى
  });
  const [reportPlant, setReportPlant] = useState('ALL');
  const [reportFrom, setReportFrom] = useState('');
  const [reportTo, setReportTo] = useState('');

  useEffect(() => {
    if (!currentUser || !tripsLoaded) return;
    localStorage.setItem('trips_data', JSON.stringify(trips));
    localStorage.setItem('trips', JSON.stringify(trips));
    saveTrips(currentUser.username, trips).catch(() => {});
  }, [trips, currentUser?.username, tripsLoaded]);

  const resetForm = () => {
    const today = new Date().toISOString().split('T')[0];
    setForm({ plant: 'PLANT-A', date: today, code: '', driver: '', qty: '10', pump: 'p01', estTime: '40', stationArr: '', stationDep: '', siteArr: '', siteDep: '', siteName: '', projectName: '', status: 'COMPLETED', siteGeo: '', nextSiteGeo: '', skipWash: false, pumpDepartureTime: '', pumpArrivalTime: '', pourStartTime: '', delayReason: 'ready', delayDetails: '', equipmentType: 'mixer' });
  };

  const openAdd = () => { resetForm(); setEditId(null); setShowAdd(true); };
  const openEdit = (t: Trip) => {
    setEditId(t.id);
    setForm({ plant: t.plant, date: t.date, code: t.code, driver: t.driver, qty: String(t.qty), pump: t.pump, estTime: String(t.estTime), stationArr: t.stationArr, stationDep: t.stationDep, siteArr: t.siteArr, siteDep: t.siteDep, siteName: t.siteName, projectName: t.projectName, status: t.status, siteGeo: t.siteGeo || '', nextSiteGeo: t.nextSiteGeo || '', skipWash: false, pumpDepartureTime: t.pumpDepartureTime || '', pumpArrivalTime: t.pumpArrivalTime || '', pourStartTime: t.pourStartTime || '', delayReason: t.delayReason || 'ready', delayDetails: t.delayDetails || '', equipmentType: 'mixer' });
    setShowAdd(true);
  };


  const deleteTrip = (id: number) => {
    if (confirm('Remove this trip?')) setTrips(prev => prev.filter(t => t.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // حساب الكمية التراكمية للمضخة في نفس الموقع
    let consecutiveQty = Number(form.qty) || 0;
    if (form.pump && form.siteName && form.date) {
      const existingQty = getConsecutiveQty(trips, form.pump, form.siteName, form.date);
      consecutiveQty = existingQty + (Number(form.qty) || 0);
    }
    
    // تحديد إذا كان هناك تأخير
    let delayReason = form.delayReason;
    let delayDetails = form.delayDetails;
    
    // إذا كان pumpArrivalTime و pourStartTime موجودين، نحسب وقت الانتظار
    let waitingTime = 0;
    if (form.pumpArrivalTime && form.pourStartTime && form.pumpArrivalTime !== '00:00' && form.pourStartTime !== '00:00') {
      const arrTime = form.pumpArrivalTime.split(':');
      const pourTime = form.pourStartTime.split(':');
      const arrMinutes = parseInt(arrTime[0]) * 60 + parseInt(arrTime[1]);
      const pourMinutes = parseInt(pourTime[0]) * 60 + parseInt(pourTime[1]);
      waitingTime = pourMinutes - arrMinutes;
      
      // إذا كان وقت الانتظار أكثر من 30 دقيقة، نحسب سبب التأخير
      if (waitingTime > 30 && delayReason === 'ready') {
        delayReason = 'site_not_ready';
      }
    }
    
    const newTrip: Trip = {
      id: editId || Date.now(), plant: form.plant, date: form.date, code: form.code, driver: form.driver,
      qty: Number(form.qty) || 0, pump: form.pump || '--', estTime: Number(form.estTime) || 40,
      stationArr: form.stationArr || '00:00', stationDep: form.stationDep || '00:00',
      siteArr: form.siteArr || '00:00', siteDep: form.siteDep || '00:00',
      siteName: form.siteName || '--', projectName: form.projectName || '--', status: form.status,
      siteGeo: form.siteGeo || undefined,
      nextSiteGeo: form.nextSiteGeo || undefined,
      consecutiveQty: consecutiveQty,
      // أوقات البامب الجديدة
      pumpDepartureTime: form.pumpDepartureTime || undefined,
      pumpArrivalTime: form.pumpArrivalTime || undefined,
      pourStartTime: form.pourStartTime || undefined,
      delayReason: delayReason as 'ready' | 'site_not_ready' | 'breakdown' | 'emergency' | 'other' | undefined,
      delayDetails: delayDetails,
    };
    if (editId) setTrips(prev => prev.map(t => t.id === editId ? newTrip : t));
    else setTrips(prev => [...prev, newTrip]);
    setShowAdd(false);
  };

  const filtered = trips.filter(t => t.code.toLowerCase().includes(search.toLowerCase()));

  // Report calculations
  const reportTrips = trips.filter(t => {
    const plantMatch = reportPlant === 'ALL' || t.plant === reportPlant;
    const dateMatch = (!reportFrom || t.date >= reportFrom) && (!reportTo || t.date <= reportTo);
    return plantMatch && dateMatch;
  });

  const fleetData: Record<string, { code: string; tripsCount: number; totalLoad: number; sumPlant: number; sumSite: number; sumTransit: number; sumTotal: number; sumDelay: number }> = {};
  reportTrips.forEach(t => {
    if (!fleetData[t.code]) fleetData[t.code] = { code: t.code, tripsCount: 0, totalLoad: 0, sumPlant: 0, sumSite: 0, sumTransit: 0, sumTotal: 0, sumDelay: 0 };
    const fd = fleetData[t.code];
    fd.tripsCount++; fd.totalLoad += t.qty;
    fd.sumPlant += cleanDur(t.stationArr, t.stationDep);
    fd.sumSite += cleanDur(t.siteArr, t.siteDep);
    fd.sumTransit += cleanDur(t.stationDep, t.siteArr);
    fd.sumTotal += cleanDur(t.stationArr, t.siteDep);
    const plantDur = cleanDur(t.stationArr, t.stationDep);
    if (plantDur > 12) fd.sumDelay += plantDur - 12;
  });

  const totalQty = reportTrips.reduce((s, t) => s + t.qty, 0);
  const totalTrips = reportTrips.length;
  const settings = PLANT_SETTINGS[reportPlant];
  const totalActiveMin = reportTrips.reduce((s, t) => s + cleanDur(t.stationArr, t.siteDep), 0);
  const utilization = settings ? Math.min((totalActiveMin / (settings.mixers * 480)) * 100, 100) : 0;
  const dateCount = (reportFrom && reportTo && reportFrom !== reportTo) ? Math.round((new Date(reportTo).getTime() - new Date(reportFrom).getTime()) / 86400000) + 1 : 1;
  const targetVol = dateCount * 8 * (settings?.actualCap || 70);
  const plantEff = targetVol > 0 ? Math.min((totalQty / targetVol) * 100, 100) : 0;

  const exportCSV = () => {
    let csv = 'Truck,Trips,Load (m³),Avg Plant,Avg Site,Avg Transit,Avg Total,Notes\n';
    Object.values(fleetData).forEach(fd => {
      csv += `${fd.code},${fd.tripsCount},${fd.totalLoad.toFixed(1)},${Math.round(fd.sumPlant / fd.tripsCount)},${Math.round(fd.sumSite / fd.tripsCount)},${Math.round(fd.sumTransit / fd.tripsCount)},${Math.round(fd.sumTotal / fd.tripsCount)},${fd.sumDelay > 0 ? `Delay ${fd.sumDelay}m` : 'On Time'}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'operations_report.csv'; a.click();
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-blue-400 underline">Back to Login</Link></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9]">
      <div className="bg-gradient-to-br from-[#0f1729] to-[#1a2332] border-b border-[#2a3a5c] px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/" className="text-slate-400 text-xs border border-[#2a3a5c] px-2.5 py-1 rounded hover:text-white transition">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🚛 Mixer Truck & Concrete Operations Tracker</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <p className="text-[10px] text-emerald-500/80">Design by Dr. Ahmad Abdo Alyan</p>
        </div>
      </div>

      <header className="bg-[#1e293b] border-b border-[#334155] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-white">Concrete Operations & Transit Tracker</h1><p className="text-xs text-emerald-500">Multi-Plant Operations & Fleet Efficiency Analyzer</p></div>
        <div className="flex gap-3 flex-wrap items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search truck code..." className="bg-[#334155] text-white text-sm px-3 py-2 rounded-lg border border-[#475569] outline-none focus:border-emerald-500 w-44" />
          <button onClick={() => { const t = new Date().toISOString().split('T')[0]; setReportFrom(t); setReportTo(t); setShowReport(true); }} className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg font-medium">📂 Fleet Report</button>
          <button onClick={openAdd} className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg font-medium">➕ New Trip</button>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.length === 0 && <p className="text-slate-500 text-center col-span-full py-20">No trips recorded yet or matching your search.</p>}
          {filtered.map(t => {
            const plantDur = cleanDur(t.stationArr, t.stationDep);
            const transitDur = cleanDur(t.stationDep, t.siteArr);
            const isCritical = transitDur > 120;
            return (
              <div key={t.id} className={`bg-[#1e293b] border rounded-xl p-5 shadow-lg ${isCritical ? 'border-red-500 bg-gradient-to-br from-[#1e293b] to-red-950 animate-pulse' : 'border-[#334155]'}`}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">{t.status}</span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(t)} className="bg-green-500 hover:bg-green-600 text-white text-[11px] px-2 py-0.5 rounded font-bold">✏️</button>
                    <button onClick={() => deleteTrip(t.id)} className="bg-red-500 hover:bg-red-600 text-white text-[11px] px-2 py-0.5 rounded font-bold">🗑️</button>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white">{t.code}</h3>
                <div className="border-t border-[#334155]/50 pt-3 mt-3 space-y-1 text-sm text-slate-300">
                  <p><span className="text-slate-500">Plant:</span> <strong>{t.plant}</strong></p>
                  <p><span className="text-slate-500">Date:</span> {t.date}</p>
                  <p><span className="text-slate-500">Driver:</span> {t.driver}</p>
                  <p><span className="text-slate-500">Load:</span> {t.qty} m³ | Pump: {t.pump}</p>
                  <p><span className="text-slate-500">Project:</span> {t.siteName} ({t.projectName})</p>
                  {t.pump && t.siteName && t.date && (() => {
                    const cq = getConsecutiveQty(trips, t.pump, t.siteName, t.date);
                    const needsWash = cq > 200;
                    return (
                      <div className={`mt-2 p-2 rounded border ${needsWash ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                        <p className={`text-xs font-bold ${needsWash ? 'text-red-300' : 'text-green-300'}`}>
                          🚛 Pump {t.pump} total @ {t.siteName}: <span className="text-base">{cq.toFixed(1)} m³</span>
                        </p>
                        {needsWash && <p className="text-[10px] text-red-400 mt-1">⚠️ Exceeded 200m³ - Return to plant for wash</p>}
                        <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: needsWash ? '#7f1d1d' : '#14532d' }}>
                          <div className={`h-full ${needsWash ? 'bg-red-500' : 'bg-green-500'} transition-all`} style={{ width: `${Math.min(100, (cq / 200) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                  <p className={`font-bold ${plantDur > 12 ? 'text-red-400' : 'text-green-400'}`}>🏭 Plant: {plantDur > 12 ? `Delay ${plantDur - 12}m` : `On Time (${plantDur}m)`}</p>
                  <p className={`font-bold ${isCritical ? 'text-red-400 animate-pulse' : transitDur > Number(t.estTime) ? 'text-red-400' : 'text-green-400'}`}>
                    🚚 Transit: {isCritical ? `🚨 CRITICAL ${transitDur}m` : transitDur > Number(t.estTime) ? `Delay ${transitDur - Number(t.estTime)}m` : `On Time (${transitDur}m)`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-3 pt-3 border-t border-[#334155]/30 text-[11px] text-slate-400">
                  <div>Arr Plant: <span className="text-white">{fmtTime(t.stationArr)}</span></div>
                  <div>Dep Plant: <span className="text-white">{fmtTime(t.stationDep)}</span></div>
                  <div>Arr Site: <span className="text-white">{fmtTime(t.siteArr)}</span></div>
                  <div>Dep Site: <span className="text-white">{fmtTime(t.siteDep)}</span></div>
                </div>
                {/* Pump Timing Section */}
                {(t.pumpDepartureTime || t.pumpArrivalTime || t.pourStartTime) && (
                  <div className="mt-2 pt-2 border-t border-[#334155]/30">
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div>Pump Out: <span className="text-orange-400 font-bold">{fmtTime(t.pumpDepartureTime || '00:00')}</span></div>
                      <div>Pump In: <span className="text-orange-400 font-bold">{fmtTime(t.pumpArrivalTime || '00:00')}</span></div>
                      <div>Pour Start: <span className="text-orange-400 font-bold">{fmtTime(t.pourStartTime || '00:00')}</span></div>
                    </div>
                    {t.delayReason && t.delayReason !== 'ready' && (
                      <div className={`mt-1 p-1.5 rounded text-[10px] ${
                        t.delayReason === 'site_not_ready' ? 'bg-red-500/10 border border-red-500/30 text-red-300' :
                        t.delayReason === 'breakdown' ? 'bg-orange-500/10 border border-orange-500/30 text-orange-300' :
                        t.delayReason === 'emergency' ? 'bg-red-600/10 border border-red-600/30 text-red-400' :
                        'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300'
                      }`}>
                        <span className="font-bold">
                          {t.delayReason === 'site_not_ready' && '🏗️ Site Not Ready'}
                          {t.delayReason === 'breakdown' && '🔧 Breakdown'}
                          {t.delayReason === 'emergency' && '🚨 Emergency'}
                          {t.delayReason === 'other' && '📝 Other'}
                        </span>
                        {t.delayDetails && <span className="ml-1">- {t.delayDetails}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-2xl w-full max-w-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-[#334155] pb-3">
              <h2 className="text-lg font-bold text-white">{editId ? '✏️ Update Trip' : '➕ Log New Trip'}</h2>
              <button onClick={() => setShowAdd(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-blue-400 font-bold">Batch Plant</label>
                <select value={form.plant} onChange={e => setForm({ ...form, plant: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none">
                  <option value="PLANT-A">Plant A</option><option value="PLANT-B">Plant B</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DatePicker value={form.date} onChange={val => setForm({ ...form, date: val })} label="Date" required />
                <div><label className="text-xs text-slate-400 font-semibold">Truck Code</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="m01" className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Driver</label><input value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Qty (m³)</label><input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Pump Code</label><input value={form.pump} onChange={e => setForm({ ...form, pump: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Est Trip (mins)</label><input type="number" value={form.estTime} onChange={e => setForm({ ...form, estTime: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Station Arrival</label><input type="time" value={form.stationArr} onChange={e => setForm({ ...form, stationArr: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Station Departure</label><input type="time" value={form.stationDep} onChange={e => setForm({ ...form, stationDep: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Site Arrival</label><input type="time" value={form.siteArr} onChange={e => setForm({ ...form, siteArr: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Site Departure</label><input type="time" value={form.siteDep} onChange={e => setForm({ ...form, siteDep: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Site Name</label><input value={form.siteName} onChange={e => setForm({ ...form, siteName: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Project Name</label><input value={form.projectName} onChange={e => setForm({ ...form, projectName: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none" /></div>
              </div>
              
              {/* 🗺️ Site Coordinates */}
              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-blue-300 font-semibold">🗺️ Location Tracking</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Current Site Coordinates (lat,lng)</label>
                    <input value={form.siteGeo} onChange={e => setForm({ ...form, siteGeo: e.target.value })} placeholder="26.4207, 50.0888" className="w-full bg-[#1e293b] border border-[#475569] rounded p-2 text-white text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Next Site Coordinates (lat,lng)</label>
                    <input value={form.nextSiteGeo} onChange={e => setForm({ ...form, nextSiteGeo: e.target.value })} placeholder="26.4500, 50.1000" className="w-full bg-[#1e293b] border border-[#475569] rounded p-2 text-white text-xs" />
                  </div>
                </div>
                {form.nextSiteGeo && parseGeo(form.nextSiteGeo) && (
                  <button type="button" onClick={() => {
                    const current = parseGeo(form.siteGeo);
                    const next = parseGeo(form.nextSiteGeo);
                    if (current && next) {
                      const dist = calculateDistance(current.lat, current.lng, next.lat, next.lng);
                      alert(`📏 Distance to next site: ${dist.toFixed(2)} km`);
                    }
                  }} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-1.5 rounded font-bold">📍 Calculate Distance</button>
                )}
              </div>
              
              {/* 🚛 Pump Movement Control */}
              {form.pump && form.siteName && form.date && (() => {
                const consecutiveQty = getConsecutiveQty(trips, form.pump, form.siteName, form.date) + (Number(form.qty) || 0);
                const needsWash = consecutiveQty > 200;
                return (
                  <div className={`border rounded-lg p-3 space-y-2 ${needsWash ? 'bg-red-900/20 border-red-500/50' : 'bg-green-900/20 border-green-500/50'}`}>
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-bold ${needsWash ? 'text-red-300' : 'text-green-300'}`}>
                        🚛 Pump {form.pump} @ {form.siteName}
                      </p>
                      <span className={`text-lg font-bold ${needsWash ? 'text-red-400' : 'text-green-400'}`}>
                        {consecutiveQty.toFixed(1)} m³
                      </span>
                    </div>
                    {needsWash ? (
                      <div className="space-y-2">
                        <p className="text-xs text-red-200">⚠️ Exceeded 200m³ - Return to plant for wash before moving to next site</p>
                        <div className="h-2 bg-red-950 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.min(100, (consecutiveQty / 200) * 100)}%` }} />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-red-300 cursor-pointer">
                          <input type="checkbox" checked={form.skipWash} onChange={e => setForm({ ...form, skipWash: e.target.checked })} className="w-4 h-4" />
                          <span>Skip wash (move to nearest site without returning)</span>
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs text-green-200">✅ Within 200m³ - Can move to nearest site without wash</p>
                        <div className="h-2 bg-green-950 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 transition-all" style={{ width: `${(consecutiveQty / 200) * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* أوقات البامب */}
              <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-orange-300 font-semibold">🚰 Pump Timing & Delays</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Pump Departure</label>
                    <input type="time" value={form.pumpDepartureTime} onChange={e => setForm({ ...form, pumpDepartureTime: e.target.value })} className="w-full bg-[#1e293b] border border-[#475569] rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Pump Arrival</label>
                    <input type="time" value={form.pumpArrivalTime} onChange={e => setForm({ ...form, pumpArrivalTime: e.target.value })} className="w-full bg-[#1e293b] border border-[#475569] rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Pour Start</label>
                    <input type="time" value={form.pourStartTime} onChange={e => setForm({ ...form, pourStartTime: e.target.value })} className="w-full bg-[#1e293b] border border-[#475569] rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold">Delay Reason</label>
                  <select value={form.delayReason} onChange={e => setForm({ ...form, delayReason: e.target.value as any })} className="w-full bg-[#1e293b] border border-[#475569] rounded p-1.5 text-white text-xs">
                    <option value="ready">✅ On Time / No Delay</option>
                    <option value="site_not_ready">🏗️ Site Not Ready</option>
                    <option value="breakdown">🔧 Breakdown</option>
                    <option value="emergency">🚨 Emergency</option>
                    <option value="other">📝 Other</option>
                  </select>
                </div>
                {form.delayReason !== 'ready' && (
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Delay Details</label>
                    <input type="text" value={form.delayDetails} onChange={e => setForm({ ...form, delayDetails: e.target.value })} placeholder="Describe the delay..." className="w-full bg-[#1e293b] border border-[#475569] rounded p-1.5 text-white text-xs" />
                  </div>
                )}
              </div>
              
              <div>
                <label className="text-xs text-slate-400 font-semibold">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2.5 text-white text-sm outline-none">
                  <option value="COMPLETED">Completed ✅</option><option value="TRANSIT">In Transit 🚚</option><option value="UNLOADING">Unloading 🏗️</option><option value="PLANT">At Plant 🏭</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition">💾 Save Trip</button>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1e293b] border border-[#334155] rounded-2xl w-full max-w-4xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-[#334155] pb-3">
              <h2 className="text-lg font-bold text-white">📅 Fleet Report</h2>
              <button onClick={() => setShowReport(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><label className="text-xs text-slate-400">Plant</label><select value={reportPlant} onChange={e => setReportPlant(e.target.value)} className="w-full bg-[#334155] border border-[#475569] rounded-lg p-2 text-white text-sm"><option value="ALL">All</option><option value="PLANT-A">Plant A</option><option value="PLANT-B">Plant B</option></select></div>
              <DatePicker value={reportFrom} onChange={setReportFrom} label="From" />
              <DatePicker value={reportTo} onChange={setReportTo} label="To" />
            </div>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[{ label: 'Total Poured', value: `${totalQty.toFixed(1)} m³`, color: 'border-emerald-500' }, { label: 'Total Trips', value: String(totalTrips), color: 'border-blue-500' }, { label: 'Fleet Utilization', value: `${utilization.toFixed(1)}%`, color: 'border-yellow-500' }, { label: 'Plant Efficiency', value: `${plantEff.toFixed(1)}%`, color: 'border-purple-500' }].map(kpi => (
                <div key={kpi.label} className={`bg-[#0f172a] border-l-4 ${kpi.color} p-3 rounded-lg`}>
                  <p className="text-[10px] text-slate-400">{kpi.label}</p><p className="text-lg font-bold text-white">{kpi.value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-[#334155] text-xs uppercase text-slate-200">
                  <tr><th className="p-3">Truck</th><th className="p-3">Trips</th><th className="p-3">Load (m³)</th><th className="p-3">Avg Plant</th><th className="p-3">Avg Site</th><th className="p-3">Avg Transit</th><th className="p-3">Avg Total</th><th className="p-3">Notes</th></tr>
                </thead>
                <tbody>
                  {Object.values(fleetData).map(fd => (
                    <tr key={fd.code} className="border-b border-[#334155]">
                      <td className="p-3 font-bold">{fd.code}</td><td className="p-3">{fd.tripsCount}</td><td className="p-3 text-emerald-400 font-bold">{fd.totalLoad.toFixed(1)} m³</td>
                      <td className="p-3">{Math.round(fd.sumPlant / fd.tripsCount)}m</td><td className="p-3">{Math.round(fd.sumSite / fd.tripsCount)}m</td>
                      <td className="p-3">{Math.round(fd.sumTransit / fd.tripsCount)}m</td><td className="p-3">{Math.round(fd.sumTotal / fd.tripsCount)}m</td>
                      <td className="p-3">{fd.sumDelay > 0 ? <span className="text-yellow-400 font-bold">⚠️ Delay {fd.sumDelay}m</span> : '🟢 On Time'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={exportCSV} className="bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold px-6 py-2.5 rounded-lg">📊 Excel/CSV</button>
              <button onClick={() => window.print()} className="bg-sky-500 hover:bg-sky-600 text-white font-bold px-6 py-2.5 rounded-lg">🖨️ Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
