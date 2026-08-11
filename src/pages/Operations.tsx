import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadTrips, saveTrips, loadOrders, saveOrders, loadPlantGPS, loadAssets, loadInventory, addNotification } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import PlantLogo from '../components/PlantLogo';
import DatePicker from '../components/DatePicker';
import DriverLiveBroadcast from '../components/DriverLiveBroadcast';
import NotificationsBell from '../components/NotificationsBell';

interface Trip {
  id: number; plant: string; date: string; code: string; driver: string;
  qty: number; pump: string; estTime: number;
  stationArr: string; stationDep: string; siteArr: string; siteDep: string;
  siteName: string; projectName: string; status: string;
  orderId?: string; // رقم الطلب المرتبط (orderNo) — الرابط بين الأقسام
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

interface BatchRecipe { code: string; cement: number; sand: number; gravel: number; water: number; admixture: number; }
const BATCH_RECIPES: BatchRecipe[] = [
  { code: 'C25', cement: 320, sand: 780, gravel: 1080, water: 160, admixture: 4.8 },
  { code: 'C30', cement: 350, sand: 750, gravel: 1100, water: 160, admixture: 5.5 },
  { code: 'C35', cement: 380, sand: 720, gravel: 1120, water: 155, admixture: 6.2 },
  { code: 'C40', cement: 420, sand: 680, gravel: 1140, water: 150, admixture: 7.5 },
];
const BATCH_STEPS = ['Weighing Cement', 'Weighing Sand', 'Weighing Gravel', 'Adding Water', 'Adding Admixture', 'Mixing Cycle', 'Discharging to Truck'];

export default function Operations() {
  const { currentUser } = useAuth();
  const { t } = useLang();
  const batchSteps = [t('stepWeighCement'), t('stepWeighSand'), t('stepWeighGravel'), t('stepAddWater'), t('stepAddAdmixture'), t('stepMixingCycle'), t('stepDischarging')];
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
  const [showLive, setShowLive] = useState(false);
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
  const [showBatching, setShowBatching] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatch, setDispatch] = useState({ distance: '25', speed: '35', pourRate: '35', capacity: '10', totalLoad: '100', settingTime: '90', traffic: '1.3' });
  const [plantGeo, setPlantGeo] = useState('24.7136,46.6753');
  const [autoSite, setAutoSite] = useState('');
  const [confirmedOrders, setConfirmedOrders] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [inventory, setInventory] = useState<Record<string, number> | null>(null);
  const [dispatchOrder, setDispatchOrder] = useState('');
  useEffect(() => {
    if (!currentUser) return;
    loadOrders(currentUser.username).then(ords => {
      const list = Array.isArray(ords) ? ords : [];
      setOrders(list);
      setConfirmedOrders(list.filter(o => o.status === 'scheduled' && o.accountStatus === 'approved' && o.debtStatus !== 'blocked'));
    }).catch(() => {});
    loadPlantGPS(currentUser.username).then(gps => {
      if (gps) setPlantGeo(`${gps.lat},${gps.lng}`);
    }).catch(() => {});
    loadAssets(currentUser.username).then(a => { if (Array.isArray(a)) setAssets(a); }).catch(() => {});
    loadInventory(currentUser.username).then(i => { if (i && typeof i === 'object') setInventory(i); }).catch(() => {});
  }, [currentUser?.username]);
  useEffect(() => {
    if (!currentUser || !orders.length) return;
    saveOrders(currentUser.username, orders).catch(() => {});
  }, [orders, currentUser?.username]);
  const applyAutoDistance = () => {
    const target = confirmedOrders.find(o => o.locationCoords && o.locationCoords.includes(','));
    if (!target) { alert(t('noGpsOrder')); return; }
    const [slat, slng] = plantGeo.split(',').map(Number);
    const [dlat, dlng] = target.locationCoords.split(',').map(Number);
    if ([slat, slng, dlat, dlng].some(v => isNaN(v))) { alert(t('invalidCoordinates')); return; }
    const dist = calculateDistance(slat, slng, dlat, dlng);
    setDispatch({ ...dispatch, distance: String(Math.round(dist * 10) / 10), totalLoad: String(Number(dispatch.totalLoad) || target.quantity || dispatch.totalLoad) });
    setAutoSite(`${target.projectName || target.site || ''} (${dist.toFixed(1)} km)`);
  };
  // 🚀 Dispatch a confirmed order → checks inventory + fleet, then creates linked trips
  const dispatchOrderToFleet = async (order: any) => {
    const mixers = (Array.isArray(assets) ? assets : []).filter(a => a.type === 'Mixer' && a.status === 'Ready');
    const pumps = (Array.isArray(assets) ? assets : []).filter(a => a.type === 'Mobile Pump' && a.status === 'Ready');
    if (order.requiresPump && pumps.length === 0) { alert('🚫 ' + t('noReadyPump')); return; }
    if (mixers.length === 0) { alert('🚫 ' + t('noReadyMixer')); return; }
    const cementNeeded = (Number(order.quantity) || 0) * 0.35;
    if (inventory && typeof inventory.cement === 'number' && inventory.cement < cementNeeded) {
      alert(`⛔ ${t('insufficientCement')}: ${t('required')} ${cementNeeded.toFixed(1)} ${t('tons')} ${t('available')} ${inventory.cement.toFixed(1)} ${t('tons')} — ${t('addInventoryInProduction')}.`);
      return;
    }
    const capacity = Number(dispatch.capacity) || 10;
    const trucksNeeded = Math.max(1, Math.ceil((Number(order.quantity) || 0) / capacity));
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const today = now.toISOString().split('T')[0];
    const pump = order.requiresPump ? (pumps[0]?.id || '—') : '—';
    const newTrips: Trip[] = Array.from({ length: trucksNeeded }).map((_, i) => {
      const m = mixers[i % mixers.length];
      return {
        id: Date.now() + i, plant: 'PLANT-A', date: today, code: m.id, driver: m.driver || '—',
        qty: Math.min(capacity, (Number(order.quantity) || 0) - i * capacity), pump, estTime: Number(dispatch.estTime) || 40,
        stationArr: nowTime, stationDep: nowTime, siteArr: '', siteDep: '',
        siteName: order.projectName || '—', projectName: order.projectName || '—', status: 'TRANSIT',
        siteGeo: order.locationCoords || undefined, orderId: order.orderNo || order.id,
      };
    });
    setTrips(prev => [...prev, ...newTrips]);
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'in_progress', deliveredQty: 0 } : o));
    setConfirmedOrders(prev => prev.filter(o => o.id !== order.id));
    setDispatchOrder('');
    if (currentUser) addNotification(currentUser.username, {
      level: 'success', title: '🚀 ' + t('orderDispatched') + ' ' + (order.orderNo || order.id),
      body: `${trucksNeeded} ${t('trips')} ${t('to')} ${order.projectName || '—'} (${order.quantity} m³) ${t('withFleet')} ${mixers.length} ${t('readyMixers')} — ${t('cementAvailable')} ${inventory && typeof inventory.cement === 'number' ? inventory.cement.toFixed(0) : '—'} ${t('tons')}`,
    }).catch(() => {});
    alert(`✅ ${t('tripsPrepared')} ${trucksNeeded} ${t('trips')} ${t('forOrder')} ${order.orderNo || order.id} ${t('onTrucks')}: ${newTrips.map(t => t.code).join(', ')} — ${t('dispatchStarted')}.`);
  };
  const dispatchResult = (() => {
    const dist = Number(dispatch.distance), spd = Number(dispatch.speed) || 1;
    const pour = Number(dispatch.pourRate) || 1, cap = Number(dispatch.capacity) || 1;
    const total = Number(dispatch.totalLoad) || 0, set = Number(dispatch.settingTime) || 90, tf = Number(dispatch.traffic) || 1;
    const transitMin = (dist / spd) * 60 * tf;
    const pourMin = (cap / pour) * 60;
    const maxWait = set - transitMin;
    const gap = Math.max(5, Math.min(pourMin + 5, Math.max(5, maxWait)));
    const trucks = Math.ceil(total / cap);
    const onRoute = Math.max(1, Math.round(transitMin / gap));
    const queueTime = trucks * pourMin;
    return { transitMin, pourMin, maxWait, gap, trucks, onRoute, queueTime, feasible: maxWait >= 0 };
  })();
  const [batch, setBatch] = useState({ recipe: 'C30', qty: '10', truck: '', running: false, step: 0, pct: 0 });
  const batchTimer = useRef<number | null>(null);
  const mapTimer = useRef<number | null>(null);
  const [mapTick, setMapTick] = useState(0);
  const mapRef = useRef<HTMLCanvasElement | null>(null);

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
    if (confirm(`${t('removeTrip')}?`)) setTrips(prev => prev.filter(t => t.id !== id));
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

  // 🏭 Automated batching simulation
  const startBatch = () => {
    const qty = Number(batch.qty) || 0;
    if (qty <= 0) { alert(t('validQuantityAlert')); return; }
    if (!batch.truck) { alert(t('truckCodeAlert')); return; }
    setBatch(prev => ({ ...prev, running: true, step: 0, pct: 0 }));
    if (batchTimer.current) window.clearInterval(batchTimer.current);
    batchTimer.current = window.setInterval(() => {
      setBatch(prev => {
        const nextStep = prev.step + 1;
        const nextPct = Math.min(100, prev.pct + 100 / (BATCH_STEPS.length * 3));
        if (nextStep >= BATCH_STEPS.length * 3 + 1) {
          if (batchTimer.current) window.clearInterval(batchTimer.current);
          // auto-create the trip
          const recipe = BATCH_RECIPES.find(r => r.code === prev.recipe) || BATCH_RECIPES[1];
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, '0');
          const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
          const newTrip: Trip = {
            id: Date.now(), plant: form.plant, date: now.toISOString().split('T')[0], code: prev.truck,
            driver: 'Auto-Dispatch', qty, pump: '--', estTime: 40,
            stationArr: nowTime, stationDep: nowTime, siteArr: '', siteDep: '',
            siteName: '—', projectName: 'Auto-Batch', status: 'TRANSIT',
          };
          setTrips(prev2 => [...prev2, newTrip]);
          setBatch({ recipe: prev.recipe, qty: prev.qty, truck: prev.truck, running: false, step: 0, pct: 100 });
          return prev;
        }
        return { ...prev, step: nextStep, pct: nextPct };
      });
    }, 350);
  };
  const stopBatch = () => {
    if (batchTimer.current) window.clearInterval(batchTimer.current);
    setBatch(prev => ({ ...prev, running: false }));
  };

  // 📍 Fleet map: live trucks with geo positions
  const activeTrips = trips.filter(t => t.siteGeo && parseGeo(t.siteGeo));
  useEffect(() => {
    if (!showMap) return;
    const canvas = mapRef.current;
    if (!canvas || activeTrips.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, H);
    const plant = parseGeo(activeTrips[0].plant ? '26.4207,50.0888' : '26.4207,50.0888')!;
    const lats = activeTrips.map(t => parseGeo(t.siteGeo!)!.lat);
    const lngs = activeTrips.map(t => parseGeo(t.siteGeo!)!.lng);
    const minLat = Math.min(plant.lat, ...lats), maxLat = Math.max(plant.lat, ...lats);
    const minLng = Math.min(plant.lng, ...lngs), maxLng = Math.max(plant.lng, ...lngs);
    const padX = 60;
    const x = (lng: number) => padX + ((lng - minLng) / (maxLng - minLng || 1)) * (W - padX * 2);
    const y = (lat: number) => H - 50 - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 100);
    // grid lines
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo((W / 8) * i, 0); ctx.lineTo((W / 8) * i, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, (H / 8) * i); ctx.lineTo(W, (H / 8) * i); ctx.stroke(); }
    // plant marker
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(x(plant.lng), y(plant.lat), 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b1220'; ctx.font = 'bold 10px sans-serif';
    ctx.fillText('🏭 ' + t('plant'), x(plant.lng) - 18, y(plant.lat) - 12);
    // route lines + trucks
    activeTrips.forEach(t => {
      const geo = parseGeo(t.siteGeo!)!;
      ctx.strokeStyle = t.status === 'COMPLETED' ? '#10b981' : t.status === 'TRANSIT' ? '#3b82f6' : '#f59e0b';
      ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x(plant.lng), y(plant.lat)); ctx.lineTo(x(geo.lng), y(geo.lat)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#0f172a';
      ctx.beginPath(); ctx.arc(x(geo.lng), y(geo.lat), 9, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = t.status === 'COMPLETED' ? '#10b981' : t.status === 'TRANSIT' ? '#3b82f6' : '#f59e0b';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace';
      ctx.fillText(t.code, x(geo.lng) - 10, y(geo.lat) + 22);
    });
    const legend = `🟢 ${t('completed')}   🔵 ${t('transit')}   🟡 ${t('onSite')}`;
    ctx.fillStyle = '#94a3b8'; ctx.font = '10px sans-serif';
    ctx.fillText(legend, 12, 16);
  }, [showMap, mapTick, trips]);

  useEffect(() => {
    if (!showMap) return;
    mapTimer.current = window.setInterval(() => setMapTick(t => t + 1), 5000);
    return () => { if (mapTimer.current) window.clearInterval(mapTimer.current); };
  }, [showMap]);

  useEffect(() => () => {
    if (batchTimer.current) window.clearInterval(batchTimer.current);
    if (mapTimer.current) window.clearInterval(mapTimer.current);
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 {t('accessDenied')}</p><Link to="/" className="text-sky-400 underline">{t('backToLogin')}</Link></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← {t('backToDashboard')}</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🚛 {t('operationsTrackerTitle')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NotificationsBell />
          <PlantLogo username={currentUser.username} height={32} />
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <p className="text-[10px] text-emerald-500/80">Design by Dr. Ahmad Abdo Alyan</p>
        </div>
      </div>

      <header className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-white">{t('operationsTransitTracker')}</h1><p className="text-xs text-emerald-500">{t('operationsSubtitle')}</p></div>
        <div className="flex gap-3 flex-wrap items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchTruckCode')} className="bg-white/[0.04] text-white text-sm px-3 py-2 rounded-lg border border-white/10 outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] w-44" />
          <button onClick={() => { const t = new Date().toISOString().split('T')[0]; setReportFrom(t); setReportTo(t); setShowReport(true); }} className="bg-sky-500 hover:bg-sky-400 text-white text-sm px-4 py-2 rounded-lg font-medium shadow-[0_0_20px_rgba(56,189,248,0.3)]">📂 {t('fleetReport')}</button>
          <button onClick={() => setShowBatching(true)} className="bg-cyan-600 hover:bg-cyan-700 text-white text-sm px-4 py-2 rounded-lg font-medium">🏭 {t('batchingPanel')}</button>
          <button onClick={() => setShowMap(true)} className="bg-sky-600 hover:bg-sky-700 text-white text-sm px-4 py-2 rounded-lg font-medium">📍 {t('fleetMap')}</button>
          <button onClick={() => setShowDispatch(true)} className="bg-sky-500 hover:bg-sky-400 text-white text-sm px-4 py-2 rounded-lg font-medium">🧠 {t('smartDispatch')}</button>
          <button onClick={() => setShowLive(s => !s)} className={`text-white text-sm px-4 py-2 rounded-lg font-medium ${showLive ? 'bg-emerald-600' : 'bg-teal-600 hover:bg-teal-700'}`}>📱 {t('driverLive')}</button>
          <button onClick={openAdd} className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm px-4 py-2 rounded-lg font-medium shadow-[0_0_20px_rgba(56,189,248,0.3)]">➕ {t('newTrip')}</button>
        </div>
      </header>

      <main className="p-6">
        {showLive && (
          <div className="mb-5">
            <DriverLiveBroadcast />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.length === 0 && <p className="text-slate-500 text-center col-span-full py-20">{t('noTripsFound')}</p>}
          {filtered.map(tr => {
            const plantDur = cleanDur(tr.stationArr, tr.stationDep);
            const transitDur = cleanDur(tr.stationDep, tr.siteArr);
            const isCritical = transitDur > 120;
            return (
              <div key={tr.id} className={`bg-white/[0.04] border rounded-xl p-5 shadow-lg ${isCritical ? 'border-red-500 bg-gradient-to-br from-red-950/70 to-red-900/40 animate-pulse' : 'border-white/10'}`}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded">{tr.status}</span>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(tr)} className="bg-green-500 hover:bg-green-600 text-white text-[11px] px-2 py-0.5 rounded font-bold">✏️</button>
                    <button onClick={() => deleteTrip(tr.id)} className="bg-red-500 hover:bg-red-600 text-white text-[11px] px-2 py-0.5 rounded font-bold">🗑️</button>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white">{tr.code}</h3>
                {tr.orderId && <p className="text-[10px] font-bold text-sky-400 mt-0.5">🆔 {t('order')}: {tr.orderId}</p>}
                <div className="border-t border-white/10 pt-3 mt-3 space-y-1 text-sm text-slate-300">
                  <p><span className="text-slate-500">{t('plant')}:</span> <strong>{tr.plant}</strong></p>
                  <p><span className="text-slate-500">{t('date')}:</span> {tr.date}</p>
                  <p><span className="text-slate-500">{t('driver')}:</span> {tr.driver}</p>
                  <p><span className="text-slate-500">{t('load')}:</span> {tr.qty} m³ | {t('pump')}: {tr.pump}</p>
                  <p><span className="text-slate-500">{t('project')}:</span> {tr.siteName} ({tr.projectName})</p>
                  {tr.pump && tr.siteName && tr.date && (() => {
                    const cq = getConsecutiveQty(trips, tr.pump, tr.siteName, tr.date);
                    const needsWash = cq > 200;
                    return (
                      <div className={`mt-2 p-2 rounded border ${needsWash ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
                        <p className={`text-xs font-bold ${needsWash ? 'text-red-300' : 'text-green-300'}`}>
                          🚛 {t('pump')} {tr.pump} {t('total')} @ {tr.siteName}: <span className="text-base">{cq.toFixed(1)} m³</span>
                        </p>
                        {needsWash && <p className="text-[10px] text-red-400 mt-1">⚠️ {t('exceededWash')}</p>}
                        <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: needsWash ? '#7f1d1d' : '#14532d' }}>
                          <div className={`h-full ${needsWash ? 'bg-red-500' : 'bg-green-500'} transition-all`} style={{ width: `${Math.min(100, (cq / 200) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })()}
                  <p className={`font-bold ${plantDur > 12 ? 'text-red-400' : 'text-green-400'}`}>🏭 {t('plant')}: {plantDur > 12 ? `${t('delay')} ${plantDur - 12}m` : `${t('onTime')} (${plantDur}m)`}</p>
                  <p className={`font-bold ${isCritical ? 'text-red-400 animate-pulse' : transitDur > Number(tr.estTime) ? 'text-red-400' : 'text-green-400'}`}>
                    🚚 {t('transit')}: {isCritical ? `🚨 ${t('critical')} ${transitDur}m` : transitDur > Number(tr.estTime) ? `${t('delay')} ${transitDur - Number(tr.estTime)}m` : `${t('onTime')} (${transitDur}m)`}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-1 mt-3 pt-3 border-t border-white/10 text-[11px] text-slate-400">
                  <div>{t('arrPlant')}: <span className="text-white">{fmtTime(tr.stationArr)}</span></div>
                  <div>{t('depPlant')}: <span className="text-white">{fmtTime(tr.stationDep)}</span></div>
                  <div>{t('arrSite')}: <span className="text-white">{fmtTime(tr.siteArr)}</span></div>
                  <div>{t('depSite')}: <span className="text-white">{fmtTime(tr.siteDep)}</span></div>
                </div>
                {/* Pump Timing Section */}
                {(tr.pumpDepartureTime || tr.pumpArrivalTime || tr.pourStartTime) && (
                  <div className="mt-2 pt-2 border-t border-white/10">
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div>{t('pumpOut')}: <span className="text-orange-400 font-bold">{fmtTime(tr.pumpDepartureTime || '00:00')}</span></div>
                      <div>{t('pumpIn')}: <span className="text-orange-400 font-bold">{fmtTime(tr.pumpArrivalTime || '00:00')}</span></div>
                      <div>{t('pourStart')}: <span className="text-orange-400 font-bold">{fmtTime(tr.pourStartTime || '00:00')}</span></div>
                    </div>
                    {tr.delayReason && tr.delayReason !== 'ready' && (
                      <div className={`mt-1 p-1.5 rounded text-[10px] ${
                        tr.delayReason === 'site_not_ready' ? 'bg-red-500/10 border border-red-500/30 text-red-300' :
                        tr.delayReason === 'breakdown' ? 'bg-orange-500/10 border border-orange-500/30 text-orange-300' :
                        tr.delayReason === 'emergency' ? 'bg-red-600/10 border border-red-600/30 text-red-400' :
                        'bg-yellow-500/10 border border-yellow-500/30 text-yellow-300'
                      }`}>
                        <span className="font-bold">
                          {tr.delayReason === 'site_not_ready' && `🏗️ ${t('siteNotReady')}`}
                          {tr.delayReason === 'breakdown' && `🔧 ${t('breakdown')}`}
                          {tr.delayReason === 'emergency' && `🚨 ${t('emergency')}`}
                          {tr.delayReason === 'other' && `📝 ${t('other')}`}
                        </span>
                        {tr.delayDetails && <span className="ml-1">- {tr.delayDetails}</span>}
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
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">{editId ? `✏️ ${t('updateTrip')}` : `➕ ${t('logNewTrip')}`}</h2>
              <button onClick={() => setShowAdd(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-sky-400 font-bold">{t('batchPlant')}</label>
                <select value={form.plant} onChange={e => setForm({ ...form, plant: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none">
                  <option value="PLANT-A">Plant A</option><option value="PLANT-B">Plant B</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DatePicker value={form.date} onChange={val => setForm({ ...form, date: val })} label={t('date')} required />
                <div><label className="text-xs text-slate-400 font-semibold">{t('truckCode')}</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="m01" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">{t('driver')}</label><input value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Qty (m³)</label><input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">{t('pumpCode')}</label><input value={form.pump} onChange={e => setForm({ ...form, pump: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('estTrip')}</label><input type="number" value={form.estTime} onChange={e => setForm({ ...form, estTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">{t('stationArrival')}</label><input type="time" value={form.stationArr} onChange={e => setForm({ ...form, stationArr: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('stationDeparture')}</label><input type="time" value={form.stationDep} onChange={e => setForm({ ...form, stationDep: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">{t('siteArrival')}</label><input type="time" value={form.siteArr} onChange={e => setForm({ ...form, siteArr: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('siteDeparture')}</label><input type="time" value={form.siteDep} onChange={e => setForm({ ...form, siteDep: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">{t('siteName')}</label><input value={form.siteName} onChange={e => setForm({ ...form, siteName: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">{t('projectName')}</label><input value={form.projectName} onChange={e => setForm({ ...form, projectName: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" /></div>
              </div>
              
              {/* 🗺️ Site Coordinates */}
              <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-sky-300 font-semibold">🗺️ {t('locationTracking')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">{t('currentSiteCoords')}</label>
                    <input value={form.siteGeo} onChange={e => setForm({ ...form, siteGeo: e.target.value })} placeholder="26.4207, 50.0888" className="w-full bg-white/[0.04] border border-white/10 rounded p-2 text-white text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">{t('nextSiteCoords')}</label>
                    <input value={form.nextSiteGeo} onChange={e => setForm({ ...form, nextSiteGeo: e.target.value })} placeholder="26.4500, 50.1000" className="w-full bg-white/[0.04] border border-white/10 rounded p-2 text-white text-xs" />
                  </div>
                </div>
                {form.nextSiteGeo && parseGeo(form.nextSiteGeo) && (
                  <button type="button" onClick={() => {
                    const current = parseGeo(form.siteGeo);
                    const next = parseGeo(form.nextSiteGeo);
                    if (current && next) {
                      const dist = calculateDistance(current.lat, current.lng, next.lat, next.lng);
                      alert(`📏 ${t('distanceToNextSite')}: ${dist.toFixed(2)} km`);
                    }
                  }} className="w-full bg-sky-500 hover:bg-sky-400 text-white text-xs py-1.5 rounded font-bold">📍 {t('calculateDistance')}</button>
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
                        🚛 {t('pump')} {form.pump} @ {form.siteName}
                      </p>
                      <span className={`text-lg font-bold ${needsWash ? 'text-red-400' : 'text-green-400'}`}>
                        {consecutiveQty.toFixed(1)} m³
                      </span>
                    </div>
                    {needsWash ? (
                      <div className="space-y-2">
                        <p className="text-xs text-red-200">⚠️ {t('exceededWashMove')}</p>
                        <div className="h-2 bg-red-950 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 transition-all" style={{ width: `${Math.min(100, (consecutiveQty / 200) * 100)}%` }} />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-red-300 cursor-pointer">
                          <input type="checkbox" checked={form.skipWash} onChange={e => setForm({ ...form, skipWash: e.target.checked })} className="w-4 h-4" />
                          <span>{t('skipWash')}</span>
                        </label>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-xs text-green-200">✅ {t('withinCapacity')}</p>
                        <div className="h-2 bg-green-950 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 transition-all" style={{ width: `${(consecutiveQty / 200) * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* 🚰 Pump Timing & Delays */}
              <div className="bg-orange-900/20 border border-orange-500/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-orange-300 font-semibold">🚰 {t('pumpTimingDelays')}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">{t('pumpDeparture')}</label>
                    <input type="time" value={form.pumpDepartureTime} onChange={e => setForm({ ...form, pumpDepartureTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">{t('pumpArrival')}</label>
                    <input type="time" value={form.pumpArrivalTime} onChange={e => setForm({ ...form, pumpArrivalTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">{t('pourStart')}</label>
                    <input type="time" value={form.pourStartTime} onChange={e => setForm({ ...form, pourStartTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold">{t('delayReason')}</label>
                  <select value={form.delayReason} onChange={e => setForm({ ...form, delayReason: e.target.value as any })} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs">
                    <option value="ready">✅ {t('onTimeNoDelay')}</option>
                    <option value="site_not_ready">🏗️ {t('siteNotReady')}</option>
                    <option value="breakdown">🔧 {t('breakdown')}</option>
                    <option value="emergency">🚨 {t('emergency')}</option>
                    <option value="other">📝 {t('other')}</option>
                  </select>
                </div>
                {form.delayReason !== 'ready' && (
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">{t('delayDetails')}</label>
                    <input type="text" value={form.delayDetails} onChange={e => setForm({ ...form, delayDetails: e.target.value })} placeholder={t('describeDelay')} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs" />
                  </div>
                )}
              </div>
              
              <div>
                <label className="text-xs text-slate-400 font-semibold">{t('status')}</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none">
                  <option value="COMPLETED">{t('completed')} ✅</option><option value="TRANSIT">{t('inTransit')} 🚚</option><option value="UNLOADING">{t('unloading')} 🏗️</option><option value="PLANT">{t('atPlant')} 🏭</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">💾 {t('saveTrip')}</button>
            </form>
          </div>
        </div>
      )}

      {/* 🧠 Smart Dispatch Panel */}
      {showDispatch && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">🧠 Smart Fleet Dispatch</h2>
              <button onClick={() => setShowDispatch(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <p className="text-xs text-slate-400 mb-4">{t('dispatchPanelDesc')}</p>
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-[#0B111E] border border-white/10 rounded-lg p-3">
              <div className="flex-1 min-w-[160px]"><label className="text-xs text-slate-400">{t('plantGps')}</label><input value={plantGeo} onChange={e => setPlantGeo(e.target.value)} placeholder="24.7136,46.6753" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <button onClick={applyAutoDistance} className="bg-sky-600 hover:bg-sky-700 text-white text-xs px-3 py-2 rounded-lg font-bold mt-4">📡 {t('autoFillDistance')}</button>
              {autoSite && <span className="text-[10px] text-sky-300 mt-4">✔ {autoSite}</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div><label className="text-xs text-slate-400">{t('distanceToSite')}</label><input type="number" value={dispatch.distance} onChange={e => setDispatch({ ...dispatch, distance: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">{t('avgSpeed')}</label><input type="number" value={dispatch.speed} onChange={e => setDispatch({ ...dispatch, speed: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">{t('pourRate')}</label><input type="number" value={dispatch.pourRate} onChange={e => setDispatch({ ...dispatch, pourRate: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">{t('truckCapacity')}</label><input type="number" value={dispatch.capacity} onChange={e => setDispatch({ ...dispatch, capacity: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">{t('totalLoad')}</label><input type="number" value={dispatch.totalLoad} onChange={e => setDispatch({ ...dispatch, totalLoad: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">{t('settingStart')}</label><input type="number" value={dispatch.settingTime} onChange={e => setDispatch({ ...dispatch, settingTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">{t('trafficFactor')}</label><input type="number" step="0.1" value={dispatch.traffic} onChange={e => setDispatch({ ...dispatch, traffic: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
            </div>
            <div className={`rounded-xl p-5 border mb-4 ${dispatchResult.feasible ? 'bg-sky-500/10 border-sky-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
              <p className="text-xs text-slate-400">⏱️ {t('suggestedGap')}</p>
              <p className="text-4xl font-black text-sky-300">{dispatchResult.gap.toFixed(0)} min</p>
              {!dispatchResult.feasible && <p className="text-xs text-red-400 mt-1">🚨 {t('riskyPour')}</p>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: t('transitTime'), value: `${dispatchResult.transitMin.toFixed(0)} min` },
                { label: t('pourPerTruck'), value: `${dispatchResult.pourMin.toFixed(0)} min` },
                { label: t('trucksNeeded'), value: String(dispatchResult.trucks) },
                { label: t('onRouteAtOnce'), value: String(dispatchResult.onRoute) },
                { label: t('totalPour'), value: `${dispatchResult.queueTime.toFixed(0)} min` },
              ].map(k => (
                <div key={k.label} className="bg-[#0B111E] rounded-lg p-3 text-center border border-white/10">
                  <p className="text-[10px] text-slate-400">{k.label}</p><p className="text-lg font-bold text-white">{k.value}</p>
                </div>
              ))}
            </div>
            <div className="mb-4 bg-[#0B111E] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/10 flex justify-between items-center">
                <p className="text-xs font-bold text-white">📅 {t('scheduledOrdersPlan')}</p>
                <span className="text-[10px] text-slate-400">{confirmedOrders.length} {t('scheduled')}</span>
              </div>
              <div className="px-4 py-2.5 bg-[#0B111E] border-b border-white/10 flex flex-wrap items-center gap-2">
                <label className="text-[10px] text-slate-400 font-bold">🚛 {t('dispatchOrderCheck')}:</label>
                <select value={dispatchOrder} onChange={e => setDispatchOrder(e.target.value)} className="flex-1 min-w-[200px] bg-white/[0.04] border border-white/10 rounded-lg p-1.5 text-white text-xs">
                  <option value="">— {t('selectScheduledOrder')} —</option>
                  {confirmedOrders.map(o => <option key={o.id} value={o.id}>{o.orderNo || o.id} · {o.customerName} · {o.quantity} م³</option>)}
                </select>
                <button
                  onClick={() => {
                    const order = confirmedOrders.find(o => o.id === dispatchOrder);
                    if (!order) { alert(t('selectOrderFirst')); return; }
                    dispatchOrderToFleet(order);
                  }}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white text-xs px-4 py-2 rounded-lg font-bold shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                >
                  🚀 {t('dispatchLinkTrips')}
                </button>
              </div>
              {confirmedOrders.length === 0 && <p className="p-4 text-xs text-slate-500">{t('noConfirmedOrders')}</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">{t('order')}</th><th className="p-2">{t('qty')}</th><th className="p-2">{t('distance')}</th><th className="p-2">{t('gap')}</th><th className="p-2">{t('trucks')}</th><th className="p-2">{t('startFinish')}</th><th className="p-2">{t('action')}</th></tr></thead>
                  <tbody>
                    {confirmedOrders.map((o, idx) => {
                      const qty = Number(o.quantity) || 0;
                      const trucks = Math.ceil(qty / Number(dispatch.capacity));
                      const pourMin = (Number(dispatch.capacity) / Number(dispatch.pourRate)) * 60;
                      const dur = trucks * pourMin;
                      const startH = 7 + idx; const startM = 30;
                      const sTot = startH * 60 + startM; const eTot = sTot + dur;
                      const fmt = (m: number) => `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`;
                      return (
                        <tr key={o.id || idx} className="border-b border-white/10">
                          <td className="p-2 font-bold text-white">{o.customerName || o.projectName || o.id} <span className="text-[10px] text-slate-500">{o.concreteType} psi</span></td>
                          <td className="p-2 text-sky-400">{qty} m³</td>
                          <td className="p-2">{o.locationCoords ? '📍 GPS' : '—'}</td>
                          <td className="p-2 font-bold text-sky-300">{dispatchResult.gap.toFixed(0)} min</td>
                          <td className="p-2">{trucks}</td>
                          <td className="p-2">{fmt(sTot)} → {fmt(eTot)} ({dur.toFixed(0)} min)</td>
                          <td className="p-2"><button onClick={() => dispatchOrderToFleet(o)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-2 py-1 rounded font-bold">🚀 {t('run')}</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <button onClick={() => setShowDispatch(false)} className="mt-5 w-full bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold py-3 rounded-lg">{t('close')}</button>
          </div>
        </div>
      )}

      {/* 🏭 Automated Batching Panel */}
      {showBatching && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">🏭 {t('batchingPanelTitle')}</h2>
              <button onClick={() => { stopBatch(); setShowBatching(false); }} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div><label className="text-xs text-slate-400">{t('mixDesign')}</label>
                <select value={batch.recipe} onChange={e => setBatch({ ...batch, recipe: e.target.value })} disabled={batch.running} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm">
                  {BATCH_RECIPES.map(r => <option key={r.code} value={r.code}>{r.code}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-400">{t('quantity')}</label><input type="number" min="1" value={batch.qty} onChange={e => setBatch({ ...batch, qty: e.target.value })} disabled={batch.running} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">{t('dispatchTruck')}</label><input value={batch.truck} onChange={e => setBatch({ ...batch, truck: e.target.value })} disabled={batch.running} placeholder="m05" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
            </div>
            {batch.running && (
              <div className="bg-[#0B111E] border border-white/10 rounded-xl p-4 mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-bold text-cyan-400">{batch.running && batchSteps[Math.min(batch.step, batchSteps.length - 1)]}</span>
                  <span className="text-sm font-bold text-white">{Math.round(batch.pct)}%</span>
                </div>
                <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300" style={{ width: `${batch.pct}%` }} />
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {batchSteps.map((s, i) => (
                    <div key={s} className={`text-[8px] font-bold py-1 rounded ${i < batch.step ? 'bg-emerald-500/30 text-emerald-300' : i === batch.step ? 'bg-cyan-500/40 text-cyan-200 animate-pulse' : 'bg-white/[0.06] text-slate-500'}`}>{s.split(' ')[0]}</div>
                  ))}
                </div>
              </div>
            )}
            {batch.running && (() => {
              const r = BATCH_RECIPES.find(x => x.code === batch.recipe) || BATCH_RECIPES[1];
              const qty = Number(batch.qty) || 0;
              const kg = (v: number) => (v * qty).toFixed(0);
              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                  {[{ k: t('cement'), v: kg(r.cement), icon: '🧱' }, { k: t('sand'), v: kg(r.sand), icon: '🏖️' }, { k: t('gravel'), v: kg(r.gravel), icon: '⛰️' }, { k: t('water'), v: kg(r.water), icon: '💧' }, { k: t('admixture'), v: kg(r.admixture), icon: '🧪' }].map((d, i) => (
                    <div key={d.k} className="bg-[#0B111E] rounded-lg p-2 text-center border border-white/10">
                      <p className="text-lg">{d.icon}</p>
                      <p className="text-[9px] text-slate-400">{d.k}</p>
                      <p className={`text-sm font-bold ${i < batch.step ? 'text-emerald-400' : 'text-white'}`}>{d.v} kg</p>
                    </div>
                  ))}
                </div>
              );
            })()}
            <div className="flex gap-2">
              {!batch.running ? (
                <button onClick={startBatch} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">▶ {t('startBatch')}</button>
              ) : (
                <button onClick={stopBatch} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg">⏹ {t('stop')}</button>
              )}
              <button onClick={() => setShowBatching(false)} className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold py-3 rounded-lg">{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 📍 Fleet Map */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-4xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">📍 {t('liveFleetMap')}</h2>
              <button onClick={() => setShowMap(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            {activeTrips.length > 0 ? (
              <>
                <canvas ref={mapRef} width={820} height={420} className="w-full rounded-xl border border-white/10" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
                  {filtered.map(tr => {
                    const geo = parseGeo(tr.siteGeo!);
                    return (
                      <div key={tr.id} className="bg-[#0B111E] rounded-lg p-3 border border-white/10">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white text-sm">🚚 {tr.code}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${tr.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : tr.status === 'TRANSIT' ? 'bg-sky-500/20 text-sky-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{tr.status}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">📍 {geo ? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}` : '—'}</p>
                        <p className="text-[10px] text-slate-400">{tr.siteName} — {tr.projectName}</p>
                        {geo && <a href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`} target="_blank" rel="noreferrer" className="text-sky-400 text-[10px] font-bold underline">{t('openInGoogleMaps')}</a>}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-center py-12">{t('noTruckCoords')}</p>
            )}
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-4xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <PlantLogo username={currentUser.username} height={48} />
                <div>
                  <h2 className="text-lg font-bold text-white">📅 {t('fleetReport')}</h2>
                  <p className="text-xs text-slate-400">🟢 {currentUser.plantName} · {new Date().toLocaleDateString()}</p>
                </div>
              </div>
              <button onClick={() => setShowReport(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><label className="text-xs text-slate-400">{t('plant')}</label><select value={reportPlant} onChange={e => setReportPlant(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm"><option value="ALL">{t('all')}</option><option value="PLANT-A">Plant A</option><option value="PLANT-B">Plant B</option></select></div>
              <DatePicker value={reportFrom} onChange={setReportFrom} label={t('from')} />
              <DatePicker value={reportTo} onChange={setReportTo} label={t('to')} />
            </div>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[{ label: t('totalPoured'), value: `${totalQty.toFixed(1)} m³`, color: 'border-emerald-500' }, { label: t('totalTrips'), value: String(totalTrips), color: 'border-sky-500' }, { label: t('fleetUtilization'), value: `${utilization.toFixed(1)}%`, color: 'border-yellow-500' }, { label: t('plantEfficiency'), value: `${plantEff.toFixed(1)}%`, color: 'border-sky-500' }].map(kpi => (
                <div key={kpi.label} className={`bg-[#0B111E] border-l-4 ${kpi.color} p-3 rounded-lg`}>
                  <p className="text-[10px] text-slate-400">{kpi.label}</p><p className="text-lg font-bold text-white">{kpi.value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-white/[0.04] text-slate-400 text-xs uppercase">
                  <tr><th className="p-3">{t('truck')}</th><th className="p-3">{t('trips')}</th><th className="p-3">{t('load')}</th><th className="p-3">{t('avgPlant')}</th><th className="p-3">{t('avgSite')}</th><th className="p-3">{t('avgTransit')}</th><th className="p-3">{t('avgTotal')}</th><th className="p-3">{t('notes')}</th></tr>
                </thead>
                <tbody>
                  {Object.values(fleetData).map(fd => (
                    <tr key={fd.code} className="border-b border-white/10">
                      <td className="p-3 font-bold">{fd.code}</td><td className="p-3">{fd.tripsCount}</td><td className="p-3 text-emerald-400 font-bold">{fd.totalLoad.toFixed(1)} m³</td>
                      <td className="p-3">{Math.round(fd.sumPlant / fd.tripsCount)}m</td><td className="p-3">{Math.round(fd.sumSite / fd.tripsCount)}m</td>
                      <td className="p-3">{Math.round(fd.sumTransit / fd.tripsCount)}m</td><td className="p-3">{Math.round(fd.sumTotal / fd.tripsCount)}m</td>
                      <td className="p-3">{fd.sumDelay > 0 ? <span className="text-yellow-400 font-bold">⚠️ {t('delay')} {fd.sumDelay}m</span> : `🟢 ${t('onTime')}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={exportCSV} className="bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-bold px-6 py-2.5 rounded-lg">📊 {t('excelCsv')}</button>
              <button onClick={() => window.print()} className="bg-sky-500 hover:bg-sky-600 text-white font-bold px-6 py-2.5 rounded-lg">🖨️ {t('print')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
