import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loadTrips, saveTrips, loadOrders, saveOrders, loadPlantGPS, loadAssets, loadInventory, addNotification } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import PlantLogo from '../components/PlantLogo';
import DatePicker from '../components/DatePicker';
import DriverLiveBroadcast from '../components/DriverLiveBroadcast';
import NotificationsBell from '../components/NotificationsBell';
import Challan from '../components/Challan';

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
  challan?: any; // بيانات مستند التوريد الرقمي الملتقط من تطبيق السائق
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
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
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
  const [challanTrip, setChallanTrip] = useState<{ trip: any; order: any; challan: any } | null>(null);
  const deliveredForOrder = (orderId?: string) =>
    (trips || []).filter(t => t.orderId === orderId && String(t.status).toUpperCase() === 'COMPLETED')
      .reduce((s, t) => s + (Number(t.qty) || 0), 0);
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
    if (!target) { alert('No scheduled order with site GPS coordinates found. Fill distance manually or add coordinates to a scheduled order.'); return; }
    const [slat, slng] = plantGeo.split(',').map(Number);
    const [dlat, dlng] = target.locationCoords.split(',').map(Number);
    if ([slat, slng, dlat, dlng].some(v => isNaN(v))) { alert('Invalid coordinates.'); return; }
    const dist = calculateDistance(slat, slng, dlat, dlng);
    setDispatch({ ...dispatch, distance: String(Math.round(dist * 10) / 10), totalLoad: String(Number(dispatch.totalLoad) || target.quantity || dispatch.totalLoad) });
    setAutoSite(`${target.projectName || target.site || ''} (${dist.toFixed(1)} km)`);
  };
  // 🚀 Dispatch a confirmed order → checks inventory + fleet, then creates linked trips
  const dispatchOrderToFleet = async (order: any) => {
    const mixers = (Array.isArray(assets) ? assets : []).filter(a => a.type === 'Mixer' && a.status === 'Ready');
    const pumps = (Array.isArray(assets) ? assets : []).filter(a => a.type === 'Mobile Pump' && a.status === 'Ready');
    if (order.requiresPump && pumps.length === 0) { alert('🚫 لا توجد مضخة جاهزة (Mobile Pump) متاحة للطلب — عايد الصيانة أو أضف معدات في Admin.'); return; }
    if (mixers.length === 0) { alert('🚫 لا توجد خلاطات جاهزة (Mixer) متاحة للطلب — عايد الصيانة أو أضف معدات في Admin.'); return; }
    const cementNeeded = (Number(order.quantity) || 0) * 0.35;
    if (inventory && typeof inventory.cement === 'number' && inventory.cement < cementNeeded) {
      alert(`⛔ مخزون الأسمنت غير كافٍ: المطلوب ${cementNeeded.toFixed(1)} طن والمتاح ${inventory.cement.toFixed(1)} طن — أضف مخزون في قسم الإنتاج.`);
      return;
    }
    const capacity = Number(dispatch.capacity) || 10;
    const trucksNeeded = Math.max(1, Math.ceil((Number(order.quantity) || 0) / capacity));
    const orderedQty = Number(order.quantity) || 0;
    const alreadyDelivered = deliveredForOrder(order.id || order.orderNo);
    const remaining = Math.max(0, orderedQty - alreadyDelivered);
    const plannedQty = Math.min(orderedQty, trucksNeeded * capacity);
    if (plannedQty > remaining + 0.001) {
      alert(`⛔ لا يمكن التجاوز عن كمية الطلب: تم توريد ${alreadyDelivered} م³ من أصل ${orderedQty} م³ — المتبقي ${Math.round(remaining * 100) / 100} م³ فقط.`);
      return;
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const today = now.toISOString().split('T')[0];
    const pump = order.requiresPump ? (pumps[0]?.id || '—') : '—';
    const newTrips: Trip[] = Array.from({ length: trucksNeeded }).map((_, i) => {
      const m = mixers[i % mixers.length];
      return {
        id: Date.now() + i, plant: 'PLANT-A', date: today, code: m.id, driver: m.driver || '—',
        qty: Math.min(capacity, (Number(order.quantity) || 0) - i * capacity), pump, estTime: Number((dispatch as any).estTime) || 40,
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
      level: 'success', title: '🚀 تم تشغيل الطلب ' + (order.orderNo || order.id),
      body: `${trucksNeeded} رحلة إلى ${order.projectName || '—'} (${order.quantity} م³) بأسطول ${mixers.length} خلاطة جاهزة — الأسمنت المتاح ${inventory && typeof inventory.cement === 'number' ? inventory.cement.toFixed(0) : '—'} طن`,
    }).catch(() => {});
    alert(`✅ تم تجهيز ${trucksNeeded} رحلة للطلب ${order.orderNo || order.id} على الشاحنات: ${newTrips.map(t => t.code).join(', ')} — الحركة بدأت والرحلات مربوطة بالطلب.`);
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

  // 🏭 Automated batching simulation
  const startBatch = () => {
    const qty = Number(batch.qty) || 0;
    if (qty <= 0) { alert('Enter a valid quantity (m³).'); return; }
    if (!batch.truck) { alert('Enter the truck code to dispatch after batching.'); return; }
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
    ctx.fillText('🏭 PLANT', x(plant.lng) - 18, y(plant.lat) - 12);
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
    const legend = '🟢 Completed   🔵 Transit   🟡 On Site';
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
        <div className="text-center"><p className="text-red-400 text-xl mb-4">🔒 Access Denied</p><Link to="/" className="text-sky-400 underline">Back to Login</Link></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-x-3 gap-y-1.5 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2.5 py-1 rounded hover:text-white transition">← Dashboard</Link>
          <QuickJump /> <LangSelector />
          <h1 className="text-sm font-bold text-white">🚛 Mixer Truck & Concrete Operations Tracker</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NotificationsBell />
          <PlantLogo username={currentUser.username} height={32} />
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <button onClick={() => { logout(); navigate('/'); }} className="bg-white/[0.05] text-slate-300 text-xs px-3 py-1.5 rounded-lg font-bold border border-white/10 hover:border-red-400/60 hover:text-red-300 transition-colors">🚪 خروج</button>
          <p className="text-[10px] text-emerald-500/80">Design by Dr. Ahmad Abdo Alyan</p>
        </div>
      </div>

      <header className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-white">Concrete Operations & Transit Tracker</h1><p className="text-xs text-emerald-500">Multi-Plant Operations & Fleet Efficiency Analyzer</p></div>
        <div className="flex gap-3 flex-wrap items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search truck code..." className="w-56 bg-white/[0.04] text-white text-sm px-4 py-2.5 rounded-lg border border-white/10 outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] placeholder:text-slate-500" />
          <button onClick={() => { const t = new Date().toISOString().split('T')[0]; setReportFrom(t); setReportTo(t); setShowReport(true); }} className="text-sm px-4 py-2.5 rounded-lg font-bold transition-all duration-300 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.3)]">📂 Fleet Report</button>
          <button onClick={() => setShowBatching(true)} className="text-sm px-4 py-2.5 rounded-lg font-bold transition-all duration-300 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10">🏭 Batching Panel</button>
          <button onClick={() => setShowMap(true)} className="text-sm px-4 py-2.5 rounded-lg font-bold transition-all duration-300 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10">📍 Fleet Map</button>
          <button onClick={() => setShowDispatch(true)} className="text-sm px-4 py-2.5 rounded-lg font-bold transition-all duration-300 bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10">🧠 Smart Dispatch</button>
          <button onClick={() => setShowLive(s => !s)} className={`text-sm px-4 py-2.5 rounded-lg font-bold transition-all duration-300 border ${showLive ? 'bg-emerald-600 text-white border-emerald-500/40' : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border-white/10'}`}>📱 Driver Live</button>
          <button onClick={openAdd} className="text-sm px-4 py-2.5 rounded-lg font-bold transition-all duration-300 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white shadow-[0_0_20px_rgba(56,189,248,0.3)]">➕ New Trip</button>
        </div>
      </header>

      <main className="p-6">
        {showLive && (
          <div className="mb-5">
            <DriverLiveBroadcast />
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.length === 0 && <p className="text-slate-500 text-center col-span-full py-20">No trips recorded yet or matching your search.</p>}
          {filtered.map(t => {
            const plantDur = cleanDur(t.stationArr, t.stationDep);
            const transitDur = cleanDur(t.stationDep, t.siteArr);
            const isCritical = transitDur > 120;
            return (
              <div key={t.id} className={`bg-white/[0.04] border rounded-xl p-5 shadow-lg ${isCritical ? 'border-red-500 bg-gradient-to-br from-red-950/70 to-red-900/40 animate-pulse' : 'border-white/10'}`}>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded">{t.status}</span>
                  <div className="flex gap-1">
                    {t.status === 'COMPLETED' && (
                      <button onClick={() => setChallanTrip({
                        trip: t,
                        order: orders.find((o) => (o.orderNo || o.id) === t.orderId) || null,
                        challan: t.challan || {},
                      })} title="مستند التوريد الرقمي" className="bg-sky-500 hover:bg-sky-600 text-white text-[11px] px-2 py-0.5 rounded font-bold">🧾</button>
                    )}
                    <button onClick={() => openEdit(t)} className="bg-green-500 hover:bg-green-600 text-white text-[11px] px-2 py-0.5 rounded font-bold">✏️</button>
                    <button onClick={() => deleteTrip(t.id)} className="bg-red-500 hover:bg-red-600 text-white text-[11px] px-2 py-0.5 rounded font-bold">🗑️</button>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white">{t.code}</h3>
                {t.orderId && <p className="text-[10px] font-bold text-sky-400 mt-0.5">🆔 طلب: {t.orderId}</p>}
                <div className="border-t border-white/10 pt-3 mt-3 space-y-1 text-sm text-slate-300">
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
                <div className="grid grid-cols-2 gap-1 mt-3 pt-3 border-t border-white/10 text-[11px] text-slate-400">
                  <div>Arr Plant: <span className="text-white">{fmtTime(t.stationArr)}</span></div>
                  <div>Dep Plant: <span className="text-white">{fmtTime(t.stationDep)}</span></div>
                  <div>Arr Site: <span className="text-white">{fmtTime(t.siteArr)}</span></div>
                  <div>Dep Site: <span className="text-white">{fmtTime(t.siteDep)}</span></div>
                </div>
                {/* Pump Timing Section */}
                {(t.pumpDepartureTime || t.pumpArrivalTime || t.pourStartTime) && (
                  <div className="mt-2 pt-2 border-t border-white/10">
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
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">{editId ? '✏️ Update Trip' : '➕ Log New Trip'}</h2>
              <button onClick={() => setShowAdd(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-sky-400 font-bold">Batch Plant</label>
                <select value={form.plant} onChange={e => setForm({ ...form, plant: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none">
                  <option value="PLANT-A">Plant A</option><option value="PLANT-B">Plant B</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DatePicker value={form.date} onChange={val => setForm({ ...form, date: val })} label="Date" required />
                <div><label className="text-xs text-slate-400 font-semibold">Truck Code</label><input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="m01" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Driver</label><input value={form.driver} onChange={e => setForm({ ...form, driver: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Qty (m³)</label><input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Pump Code</label><input value={form.pump} onChange={e => setForm({ ...form, pump: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Est Trip (mins)</label><input type="number" value={form.estTime} onChange={e => setForm({ ...form, estTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Station Arrival</label><input type="time" value={form.stationArr} onChange={e => setForm({ ...form, stationArr: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Station Departure</label><input type="time" value={form.stationDep} onChange={e => setForm({ ...form, stationDep: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Site Arrival</label><input type="time" value={form.siteArr} onChange={e => setForm({ ...form, siteArr: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Site Departure</label><input type="time" value={form.siteDep} onChange={e => setForm({ ...form, siteDep: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none [color-scheme:dark]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-400 font-semibold">Site Name</label><input value={form.siteName} onChange={e => setForm({ ...form, siteName: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" /></div>
                <div><label className="text-xs text-slate-400 font-semibold">Project Name</label><input value={form.projectName} onChange={e => setForm({ ...form, projectName: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none" /></div>
              </div>
              
              {/* 🗺️ Site Coordinates */}
              <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 space-y-2">
                <p className="text-xs text-sky-300 font-semibold">🗺️ Location Tracking</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Current Site Coordinates (lat,lng)</label>
                    <input value={form.siteGeo} onChange={e => setForm({ ...form, siteGeo: e.target.value })} placeholder="26.4207, 50.0888" className="w-full bg-white/[0.04] border border-white/10 rounded p-2 text-white text-xs" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Next Site Coordinates (lat,lng)</label>
                    <input value={form.nextSiteGeo} onChange={e => setForm({ ...form, nextSiteGeo: e.target.value })} placeholder="26.4500, 50.1000" className="w-full bg-white/[0.04] border border-white/10 rounded p-2 text-white text-xs" />
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
                  }} className="w-full bg-sky-500 hover:bg-sky-400 text-white text-xs py-1.5 rounded font-bold">📍 Calculate Distance</button>
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
                    <input type="time" value={form.pumpDepartureTime} onChange={e => setForm({ ...form, pumpDepartureTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Pump Arrival</label>
                    <input type="time" value={form.pumpArrivalTime} onChange={e => setForm({ ...form, pumpArrivalTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 font-semibold">Pour Start</label>
                    <input type="time" value={form.pourStartTime} onChange={e => setForm({ ...form, pourStartTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs [color-scheme:dark]" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-semibold">Delay Reason</label>
                  <select value={form.delayReason} onChange={e => setForm({ ...form, delayReason: e.target.value as any })} className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs">
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
                    <input type="text" value={form.delayDetails} onChange={e => setForm({ ...form, delayDetails: e.target.value })} placeholder="Describe the delay..." className="w-full bg-white/[0.04] border border-white/10 rounded p-1.5 text-white text-xs" />
                  </div>
                )}
              </div>
              
              <div>
                <label className="text-xs text-slate-400 font-semibold">Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2.5 text-white text-sm outline-none">
                  <option value="COMPLETED">Completed ✅</option><option value="TRANSIT">In Transit 🚚</option><option value="UNLOADING">Unloading 🏗️</option><option value="PLANT">At Plant 🏭</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg transition shadow-[0_0_20px_rgba(56,189,248,0.3)]">💾 Save Trip</button>
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
            <p className="text-xs text-slate-400 mb-4">AI analyses route congestion (traffic factor) and site distance to suggest the optimal time gap between mixers — preventing queueing and concrete setting on site.</p>
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-[#0B111E] border border-white/10 rounded-lg p-3">
              <div className="flex-1 min-w-[160px]"><label className="text-xs text-slate-400">Plant GPS (lat,lng)</label><input value={plantGeo} onChange={e => setPlantGeo(e.target.value)} placeholder="24.7136,46.6753" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <button onClick={applyAutoDistance} className="bg-sky-600 hover:bg-sky-700 text-white text-xs px-3 py-2 rounded-lg font-bold mt-4">📡 Auto-fill distance from GPS site</button>
              {autoSite && <span className="text-[10px] text-sky-300 mt-4">✔ {autoSite}</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <div><label className="text-xs text-slate-400">Distance to site (km)</label><input type="number" value={dispatch.distance} onChange={e => setDispatch({ ...dispatch, distance: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">Avg speed (km/h)</label><input type="number" value={dispatch.speed} onChange={e => setDispatch({ ...dispatch, speed: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">Pour rate (m³/h)</label><input type="number" value={dispatch.pourRate} onChange={e => setDispatch({ ...dispatch, pourRate: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">Truck capacity (m³)</label><input type="number" value={dispatch.capacity} onChange={e => setDispatch({ ...dispatch, capacity: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">Total load (m³)</label><input type="number" value={dispatch.totalLoad} onChange={e => setDispatch({ ...dispatch, totalLoad: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">Setting start (min)</label><input type="number" value={dispatch.settingTime} onChange={e => setDispatch({ ...dispatch, settingTime: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">Traffic factor (1–3)</label><input type="number" step="0.1" value={dispatch.traffic} onChange={e => setDispatch({ ...dispatch, traffic: e.target.value })} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
            </div>
            <div className={`rounded-xl p-5 border mb-4 ${dispatchResult.feasible ? 'bg-sky-500/10 border-sky-500/40' : 'bg-red-500/10 border-red-500/40'}`}>
              <p className="text-xs text-slate-400">⏱️ Suggested dispatch gap between mixers</p>
              <p className="text-4xl font-black text-sky-300">{dispatchResult.gap.toFixed(0)} min</p>
              {!dispatchResult.feasible && <p className="text-xs text-red-400 mt-1">🚨 Transit time exceeds concrete setting window — this pour is risky.</p>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: 'Transit time', value: `${dispatchResult.transitMin.toFixed(0)} min` },
                { label: 'Pour per truck', value: `${dispatchResult.pourMin.toFixed(0)} min` },
                { label: 'Trucks needed', value: String(dispatchResult.trucks) },
                { label: 'On route at once', value: String(dispatchResult.onRoute) },
                { label: 'Total pour', value: `${dispatchResult.queueTime.toFixed(0)} min` },
              ].map(k => (
                <div key={k.label} className="bg-[#0B111E] rounded-lg p-3 text-center border border-white/10">
                  <p className="text-[10px] text-slate-400">{k.label}</p><p className="text-lg font-bold text-white">{k.value}</p>
                </div>
              ))}
            </div>
            <div className="mb-4 bg-[#0B111E] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/10 flex justify-between items-center">
                <p className="text-xs font-bold text-white">📅 Today's Scheduled Orders — Dispatch Plan</p>
                <span className="text-[10px] text-slate-400">{confirmedOrders.length} scheduled</span>
              </div>
              <div className="px-4 py-2.5 bg-[#0B111E] border-b border-white/10 flex flex-wrap items-center gap-2">
                <label className="text-[10px] text-slate-400 font-bold">🚛 تشغيل طلب (فحص مخزون + أسطول):</label>
                <select value={dispatchOrder} onChange={e => setDispatchOrder(e.target.value)} className="flex-1 min-w-[200px] bg-white/[0.04] border border-white/10 rounded-lg p-1.5 text-white text-xs">
                  <option value="">— اختر طلباً مجدولاً —</option>
                  {confirmedOrders.map(o => <option key={o.id} value={o.id}>{o.orderNo || o.id} · {o.customerName} · {o.quantity} م³</option>)}
                </select>
                <button
                  onClick={() => {
                    const order = confirmedOrders.find(o => o.id === dispatchOrder);
                    if (!order) { alert('اختر طلباً أولاً.'); return; }
                    dispatchOrderToFleet(order);
                  }}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white text-xs px-4 py-2 rounded-lg font-bold shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                >
                  🚀 Dispatch &amp; Link Trips
                </button>
              </div>
              {confirmedOrders.length === 0 && <p className="p-4 text-xs text-slate-500">No scheduled (confirmed) orders yet. Orders move here once approved for execution.</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead className="bg-white/[0.04] text-slate-400 text-[10px]"><tr><th className="p-2">Order</th><th className="p-2">Qty</th><th className="p-2">Distance</th><th className="p-2">Gap</th><th className="p-2">Trucks</th><th className="p-2">Start → Finish</th><th className="p-2">Action</th></tr></thead>
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
                          <td className="p-2"><button onClick={() => dispatchOrderToFleet(o)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] px-2 py-1 rounded font-bold">🚀 تشغيل</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <button onClick={() => setShowDispatch(false)} className="mt-5 w-full bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold py-3 rounded-lg">Close</button>
          </div>
        </div>
      )}

      {/* 🏭 Automated Batching Panel */}
      {showBatching && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">🏭 Automated Batching Panel</h2>
              <button onClick={() => { stopBatch(); setShowBatching(false); }} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div><label className="text-xs text-slate-400">Mix Design</label>
                <select value={batch.recipe} onChange={e => setBatch({ ...batch, recipe: e.target.value })} disabled={batch.running} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm">
                  {BATCH_RECIPES.map(r => <option key={r.code} value={r.code}>{r.code}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-slate-400">Quantity (m³)</label><input type="number" min="1" value={batch.qty} onChange={e => setBatch({ ...batch, qty: e.target.value })} disabled={batch.running} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
              <div><label className="text-xs text-slate-400">Dispatch Truck</label><input value={batch.truck} onChange={e => setBatch({ ...batch, truck: e.target.value })} disabled={batch.running} placeholder="m05" className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm" /></div>
            </div>
            {batch.running && (
              <div className="bg-[#0B111E] border border-white/10 rounded-xl p-4 mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-bold text-cyan-400">{batch.running && BATCH_STEPS[Math.min(batch.step, BATCH_STEPS.length - 1)]}</span>
                  <span className="text-sm font-bold text-white">{Math.round(batch.pct)}%</span>
                </div>
                <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-300" style={{ width: `${batch.pct}%` }} />
                </div>
                <div className="grid grid-cols-7 gap-1 text-center">
                  {BATCH_STEPS.map((s, i) => (
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
                  {[{ k: 'Cement', v: kg(r.cement), icon: '🧱' }, { k: 'Sand', v: kg(r.sand), icon: '🏖️' }, { k: 'Gravel', v: kg(r.gravel), icon: '⛰️' }, { k: 'Water', v: kg(r.water), icon: '💧' }, { k: 'Admixture', v: kg(r.admixture), icon: '🧪' }].map((d, i) => (
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
                <button onClick={startBatch} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-lg shadow-[0_0_20px_rgba(56,189,248,0.3)]">▶ Start Batch</button>
              ) : (
                <button onClick={stopBatch} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg">⏹ Stop</button>
              )}
              <button onClick={() => setShowBatching(false)} className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-white font-bold py-3 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* 📍 Fleet Map */}
      {showMap && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-2xl w-full max-w-4xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">📍 Live Fleet Map</h2>
              <button onClick={() => setShowMap(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            {activeTrips.length > 0 ? (
              <>
                <canvas ref={mapRef} width={820} height={420} className="w-full rounded-xl border border-white/10" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
                  {activeTrips.map(t => {
                    const geo = parseGeo(t.siteGeo!);
                    return (
                      <div key={t.id} className="bg-[#0B111E] rounded-lg p-3 border border-white/10">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white text-sm">🚚 {t.code}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${t.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : t.status === 'TRANSIT' ? 'bg-sky-500/20 text-sky-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{t.status}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">📍 {geo ? `${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}` : '—'}</p>
                        <p className="text-[10px] text-slate-400">{t.siteName} — {t.projectName}</p>
                        {geo && <a href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`} target="_blank" rel="noreferrer" className="text-sky-400 text-[10px] font-bold underline">Open in Google Maps ↗</a>}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-center py-12">No trucks with coordinates yet. Add coordinates in trip form to see them here.</p>
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
                  <h2 className="text-lg font-bold text-white">📅 Fleet Report</h2>
                  <p className="text-xs text-slate-400">🟢 {currentUser.plantName} · {new Date().toLocaleDateString()}</p>
                </div>
              </div>
              <button onClick={() => setShowReport(false)} className="bg-red-500 hover:bg-red-600 text-white w-7 h-7 rounded-full font-bold text-sm">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><label className="text-xs text-slate-400">Plant</label><select value={reportPlant} onChange={e => setReportPlant(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm"><option value="ALL">All</option><option value="PLANT-A">Plant A</option><option value="PLANT-B">Plant B</option></select></div>
              <DatePicker value={reportFrom} onChange={setReportFrom} label="From" />
              <DatePicker value={reportTo} onChange={setReportTo} label="To" />
            </div>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[{ label: 'Total Poured', value: `${totalQty.toFixed(1)} m³`, color: 'border-emerald-500' }, { label: 'Total Trips', value: String(totalTrips), color: 'border-sky-500' }, { label: 'Fleet Utilization', value: `${utilization.toFixed(1)}%`, color: 'border-yellow-500' }, { label: 'Plant Efficiency', value: `${plantEff.toFixed(1)}%`, color: 'border-sky-500' }].map(kpi => (
                <div key={kpi.label} className={`bg-[#0B111E] border-l-4 ${kpi.color} p-3 rounded-lg`}>
                  <p className="text-[10px] text-slate-400">{kpi.label}</p><p className="text-lg font-bold text-white">{kpi.value}</p>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-white/[0.04] text-slate-400 text-xs uppercase">
                  <tr><th className="p-3">Truck</th><th className="p-3">Trips</th><th className="p-3">Load (m³)</th><th className="p-3">Avg Plant</th><th className="p-3">Avg Site</th><th className="p-3">Avg Transit</th><th className="p-3">Avg Total</th><th className="p-3">Notes</th></tr>
                </thead>
                <tbody>
                  {Object.values(fleetData).map(fd => (
                    <tr key={fd.code} className="border-b border-white/10">
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
      {challanTrip && (
        <Challan
          trip={challanTrip.trip}
          order={challanTrip.order}
          challan={challanTrip.challan}
          onClose={() => setChallanTrip(null)}
        />
      )}
    </div>
  );
}
