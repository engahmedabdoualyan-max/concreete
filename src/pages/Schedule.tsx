import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadOrders, saveOrders } from '../firebase/firestore';
import QuickJump from '../components/QuickJump';
import LangSelector from '../components/LangSelector';
import BrandLogo from '../components/BrandLogo';
import PlantLogo from '../components/PlantLogo';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Customer {
  code: string;
  name: string;
  phone: string;
  project: string;
  orderType: string;
  elementType: string;
  paymentType: string;
  category: string;
  priority: number;
  qty: number;
  concreteType: string;
  slump: string;
  geo: string;
  locationName: string;
  ignoreRestrictions: boolean;
  time: string;
}

interface Route {
  origin: string;
  destination: string;
  duration: number; // minutes
  distance: number; // km
}

export default function Schedule() {
  const { currentUser } = useAuth();
  const { t } = useLang();
  const mapRef = useRef<Leaflet.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Leaflet.Marker[]>([]);
  const polylinesRef = useRef<Leaflet.Polyline[]>([]);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [showImportModal, setShowImportModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split('T')[0]);
  const [plantGeo, setPlantGeo] = useState('26.4207, 50.0888'); // Default: Dammam
  const [plantAddress, setPlantAddress] = useState('');
  const [addressSearch, setAddressSearch] = useState('');
  const [activeGeoField, setActiveGeoField] = useState<'plant' | 'customer'>('plant');
  const [isSelectingLocation, setIsSelectingLocation] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [routes, setRoutes] = useState<Route[]>([]);

  const [form, setForm] = useState({
    code: '',
    name: '',
    phone: '',
    project: '',
    orderType: 'ready-mix',
    elementType: 'foundation',
    paymentType: 'cash',
    category: 'B',
    priority: '5',
    qty: '',
    concreteType: 'C25',
    slump: '12',
    geo: '',
    locationName: '',
    ignoreRestrictions: false,
  });

  const [restrictions, setRestrictions] = useState([
    { start: '12:00', end: '15:00' }, // Prayer time
    { start: '22:00', end: '06:00' }, // Night restriction
  ]);

  // Show toast notification
  const toast = (message: string, type: 'success' | 'error' = 'success') => {
    setShowToast({ message, type });
    setTimeout(() => setShowToast(null), 3000);
  };

  // Initialize map only in the browser. Leaflet reads `window` at module
  // evaluation time, so it must never be imported during Next SSR.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    let cancelled = false;

    void import('leaflet').then((L) => {
      if (cancelled || !mapContainerRef.current || mapRef.current) return;
      leafletRef.current = L;

      // Parse initial plant location
      const [lat, lng] = plantGeo.split(',').map(Number);

      // Initialize Leaflet map
      const map = L.map(mapContainerRef.current).setView([lat, lng], 13);

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Add plant marker
      const plantIcon = L.divIcon({
        html: '<div style="background: #ef4444; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; font-size: 16px;">🏭</div>',
        className: 'plant-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      L.marker([lat, lng], { icon: plantIcon })
        .addTo(map)
        .bindPopup(t('plantLocation'));

      // Click handler for selecting location
      map.on('click', (e: Leaflet.LeafletMouseEvent) => {
        if (isSelectingLocation) {
          const { lat, lng } = e.latlng;
          const geoStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

          if (activeGeoField === 'plant') {
            setPlantGeo(geoStr);
            // Reverse geocode to get address
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
              .then(res => res.json())
              .then(data => {
                if (data.display_name) {
                  setPlantAddress(data.display_name);
                }
              })
              .catch(() => {});
          } else {
            setForm(prev => ({ ...prev, geo: geoStr }));
            // Reverse geocode
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
              .then(res => res.json())
              .then(data => {
                if (data.display_name) {
                  setForm(prev => ({ ...prev, locationName: data.display_name }));
                }
              })
              .catch(() => {});
          }

          setIsSelectingLocation(false);
          setActiveGeoField('plant');
        }
      });
      setLeafletReady(true);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setLeafletReady(false);
    };
  }, [plantGeo, isSelectingLocation]);

  // Search address using Nominatim
  const searchAddress = async () => {
    if (!addressSearch.trim()) {
      toast(t('enterAddressToSearch'), 'error');
      return;
    }

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch)}&limit=1`
      );
      const data = await response.json();

      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const geoStr = `${parseFloat(lat).toFixed(6)}, ${parseFloat(lon).toFixed(6)}`;

        if (activeGeoField === 'plant') {
          setPlantGeo(geoStr);
          setPlantAddress(display_name);
        } else {
          setForm(prev => ({ ...prev, geo: geoStr, locationName: display_name }));
        }

        // Center map on location
        if (mapRef.current) {
          mapRef.current.setView([parseFloat(lat), parseFloat(lon)], 15);
        }

        toast(`${t('locationFound')}: ${display_name}`, 'success');
      } else {
        toast(t('addressNotFound'), 'error');
      }
    } catch (error) {
      toast(t('errorSearchingAddress'), 'error');
    }
  };

  // Update map markers when customers change
  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !mapRef.current) return;

    // Remove old markers and polylines
    markersRef.current.forEach(marker => marker.remove());
    polylinesRef.current.forEach(polyline => polyline.remove());
    markersRef.current = [];
    polylinesRef.current = [];

    // Parse plant location
    const [plantLat, plantLng] = plantGeo.split(',').map(Number);
    const plantLatLng: Leaflet.LatLngExpression = [plantLat, plantLng];

    // Add customer markers
    customers.forEach((customer, index) => {
      if (customer.geo) {
        const [lat, lng] = customer.geo.split(',').map(Number);
        const customerLatLng: Leaflet.LatLngExpression = [lat, lng];

        const customerIcon = L.divIcon({
          html: `<div style="background: ${
            customer.category === 'A' ? '#f59e0b' : customer.category === 'B' ? '#3b82f6' : '#10b981'
          }; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">${index + 1}</div>`,
          className: 'customer-marker',
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });

        const marker = L.marker(customerLatLng, { icon: customerIcon })
          .addTo(mapRef.current!)
          .bindPopup(
            `<strong>${customer.code}</strong><br/>
             ${customer.name}<br/>
             ${customer.project}<br/>
             ${customer.qty} m³ - ${customer.concreteType}`
          );

        markersRef.current.push(marker);

        // Draw route line
        const polyline = L.polyline([plantLatLng, customerLatLng], {
          color: '#3b82f6',
          weight: 3,
          opacity: 0.6,
          dashArray: '10, 10',
        }).addTo(mapRef.current!);

        polylinesRef.current.push(polyline);

        // Calculate approximate duration (assuming 40 km/h average speed)
        const distance = calculateDistance(plantLat, plantLng, lat, lng);
        const duration = Math.round((distance / 40) * 60); // minutes

        // Update routes
        setRoutes(prev => {
          const newRoutes = [...prev];
          newRoutes[index] = {
            origin: plantGeo,
            destination: customer.geo,
            duration,
            distance,
          };
          return newRoutes;
        });
      }
    });
  }, [customers, plantGeo, leafletReady]);

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Add customer
  const addCustomer = () => {
    if (!form.code || !form.name || !form.phone || !form.project || !form.qty || !form.geo) {
      toast(t('fillRequiredFieldsSelectLocation'), 'error');
      return;
    }

    if (customers.find(c => c.code === form.code)) {
      toast(t('customerCodeExists'), 'error');
      return;
    }

    const newCustomer: Customer = {
      ...form,
      priority: parseInt(form.priority),
      qty: parseFloat(form.qty),
      time: '',
    };

    setCustomers([...customers, newCustomer]);
    toast(t('customerAddedSuccessfully'), 'success');

    // Reset form
    setForm({
      code: '',
      name: '',
      phone: '',
      project: '',
      orderType: 'ready-mix',
      elementType: 'foundation',
      paymentType: 'cash',
      category: 'B',
      priority: '5',
      qty: '',
      concreteType: 'C25',
      slump: '12',
      geo: '',
      locationName: '',
      ignoreRestrictions: false,
    });
  };

  // Remove customer
  const removeCustomer = (index: number) => {
    const newCustomers = [...customers];
    newCustomers.splice(index, 1);
    setCustomers(newCustomers);
  };

  // Generate schedule
  const generateSchedule = () => {
    if (customers.length === 0) {
      toast(t('addCustomersFirst'), 'error');
      return;
    }

    let sortedCustomers = [...customers];

    if (mode === 'auto') {
      // Auto mode: sort by time first (if imported from orders), then category (A > B > C), then priority, then payment type
      sortedCustomers.sort((a, b) => {
        // First priority: sort by time if both have time
        if (a.time && b.time) {
          const timeA = a.time.split(':').map(Number);
          const timeB = b.time.split(':').map(Number);
          const minutesA = timeA[0] * 60 + timeA[1];
          const minutesB = timeB[0] * 60 + timeB[1];
          if (minutesA !== minutesB) {
            return minutesA - minutesB;
          }
        } else if (a.time && !b.time) {
          return -1; // a has time, b doesn't - a comes first
        } else if (!a.time && b.time) {
          return 1; // b has time, a doesn't - b comes first
        }

        // Second priority: category (A > B > C)
        const categoryOrder: Record<string, number> = { A: 1, B: 2, C: 3 };
        if (categoryOrder[a.category] !== categoryOrder[b.category]) {
          return categoryOrder[a.category] - categoryOrder[b.category];
        }

        // Third priority: priority number
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        // Fourth priority: payment type
        const paymentOrder: Record<string, number> = { cash: 1, credit: 2, debt: 3 };
        return paymentOrder[a.paymentType] - paymentOrder[b.paymentType];
      });
    }

    // Assign times
    let currentTime = 8 * 60; // Start at 8:00 AM (in minutes)

    sortedCustomers = sortedCustomers.map(customer => {
      const customerIndex = customers.findIndex(c => c.code === customer.code);
      const route = routes[customerIndex];
      const travelTime = route?.duration || 30; // default 30 minutes

      // Skip restrictions if ignoreRestrictions is true
      if (!customer.ignoreRestrictions) {
        // Check if current time falls in a restriction
        for (const restriction of restrictions) {
          const [startHour, startMin] = restriction.start.split(':').map(Number);
          const [endHour, endMin] = restriction.end.split(':').map(Number);
          const restrictionStart = startHour * 60 + startMin;
          const restrictionEnd = endHour * 60 + endMin;

          // Handle overnight restrictions (e.g., 22:00 to 06:00)
          if (restrictionEnd < restrictionStart) {
            if (currentTime >= restrictionStart || currentTime < restrictionEnd) {
              currentTime = restrictionEnd;
            }
          } else {
            if (currentTime >= restrictionStart && currentTime < restrictionEnd) {
              currentTime = restrictionEnd;
            }
          }
        }
      }

      // Format time
      const hours = Math.floor(currentTime / 60);
      const minutes = currentTime % 60;
      const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

      // Update customer with time
      const updatedCustomer = { ...customer, time: timeStr };

      // Move to next time slot (current time + travel + 1 hour for pouring)
      currentTime += travelTime + 60;

      return updatedCustomer;
    });

    setCustomers(sortedCustomers);
    setShowReport(true);
  };

  // Import from Orders
  const handleImportFromOrders = async (importType: 'all' | 'pending' = 'all') => {
    const ordersKey = 'concrete_plant_orders';
    let orders: any[] = [];
    if (currentUser) {
      const fbOrders = await loadOrders(currentUser.username).catch(() => null);
      if (Array.isArray(fbOrders) && fbOrders.length) orders = fbOrders;
    }
    if (!orders.length) {
      const savedOrders = localStorage.getItem(ordersKey);
      if (savedOrders) { try { orders = JSON.parse(savedOrders); } catch { orders = []; } }
    }

    if (!orders.length) {
      toast(t('noOrdersInSystem'), 'error');
      return;
    }

    // Filter orders based on import type
    let ordersToImport = orders.filter((o: any) =>
      o.accountStatus === 'approved' &&
      o.debtStatus !== 'blocked'
    );

    if (importType === 'pending') {
      ordersToImport = ordersToImport.filter((o: any) => o.status === 'scheduled');
    }

    if (ordersToImport.length === 0) {
      toast(t('noApprovedOrdersForImport'), 'error');
      return;
    }

    // Convert orders to customers
    const newCustomers: Customer[] = ordersToImport.map((order: any) => ({
      code: order.id || `ORD-${Date.now()}`,
      name: order.customerName,
      phone: order.customerPhone,
      project: order.projectName,
      orderType: order.orderType,
      elementType: 'foundation', // Default
      paymentType: order.debtStatus === 'clear' ? 'cash' : 'credit',
      category: order.accountStatus === 'approved' ? 'A' : 'B',
      priority: parseInt(order.id?.slice(-1) || '5'),
      qty: order.quantity || 0,
      concreteType: order.concreteType || 'C30',
      slump: order.slump || '12',
      geo: order.locationCoords || '',
      locationName: order.projectLocation || '',
      ignoreRestrictions: false,
      time: order.orderTime || '',
    }));

    // Check for duplicates
    const existingCodes = new Set(customers.map(c => c.code));
    const uniqueNewCustomers = newCustomers.filter(c => !existingCodes.has(c.code));

    if (uniqueNewCustomers.length === 0) {
      toast(t('allOrdersAlreadyScheduled'), 'error');
      return;
    }

    // Add to customers
    setCustomers(prev => [...prev, ...uniqueNewCustomers]);

    // Mark imported orders as scheduled
    const updatedOrders = orders.map((o: any) => {
      if (ordersToImport.some((imp: any) => imp.id === o.id)) {
        return { ...o, status: 'scheduled' };
      }
      return o;
    });
    localStorage.setItem(ordersKey, JSON.stringify(updatedOrders));
    if (currentUser) saveOrders(currentUser.username, updatedOrders).catch(() => {});

    toast(`${uniqueNewCustomers.length} ${t('ordersImportedSuccessfully')}`, 'success');
    setShowImportModal(false);
  };

  // Export to Excel
  const exportToExcel = () => {
    const headers = ['Code', 'Name', 'Phone', 'Project', 'Category', 'Priority', 'Qty (m³)', 'Concrete', 'Time', 'Address'];
    const rows = customers.map(c => [
      c.code,
      c.name,
      c.phone,
      c.project,
      c.category,
      c.priority,
      c.qty,
      c.concreteType,
      c.time,
      c.locationName,
    ]);

    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `schedule_${scheduleDate}.csv`;
    link.click();
  };

  // Print report
  const printReport = () => {
    window.print();
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">🔒 {t('accessDenied')}</p>
          <Link to="/" className="text-sky-400 underline">{t('backToLogin')}</Link>
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
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">← {t('dashboard')}</Link>
          <QuickJump />
          <LangSelector />
          <Link
            to="/orders"
            className="bg-sky-500 hover:bg-sky-400 text-white px-3 py-1 rounded text-xs font-bold"
          >
            📦 {t('orders')}
          </Link>
          <h1 className="text-sm font-black tracking-tight text-white">📅 {t('smartPouringSchedule')}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-emerald-500/15 text-emerald-500 text-xs px-3 py-1.5 rounded-lg font-bold border border-emerald-500/30">🟢 {currentUser.plantName}</span>
          <p className="text-[10px] text-emerald-500/80">{t('designBy')}</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)]">
        {/* Left Panel - Form */}
        <div className="lg:w-[450px] bg-white/[0.04] border-r border-white/10 p-6 overflow-y-auto">
          <h2 className="text-lg font-black tracking-tight text-white mb-4">📅 {t('pouringWizard')}</h2>

          {/* Address Search */}
          <div className="mb-4 p-4 bg-[#0B111E] rounded-lg border border-white/10">
            <label className="text-xs text-sky-400 font-bold mb-2 block">🔍 {t('searchAddress')}</label>
            <div className="flex gap-2">
              <input
                value={addressSearch}
                onChange={e => setAddressSearch(e.target.value)}
                placeholder={t('enterAddressExample')}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
                onKeyPress={e => e.key === 'Enter' && searchAddress()}
              />
              <button
                onClick={searchAddress}
                className="bg-sky-500 hover:bg-sky-400 text-white px-4 py-2 rounded-lg text-sm font-bold"
              >
                🔍
              </button>
            </div>
          </div>

          {/* Schedule Date */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 font-semibold mb-1 block">📅 {t('scheduleDate')}</label>
            <input
              type="date"
              value={scheduleDate}
              onChange={e => setScheduleDate(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-sm [color-scheme:dark] outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
            />
          </div>

          {/* Plant Location */}
          <div className="mb-4 p-4 bg-[#0B111E] rounded-lg border border-white/10">
            <label className="text-xs text-sky-400 font-bold mb-2 block">🏭 {t('plantLocation')}</label>
            <input
              value={plantGeo}
              readOnly
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs mb-2"
            />
            {plantAddress && (
              <p className="text-[10px] text-slate-400 mb-2">{plantAddress}</p>
            )}
            <button
              onClick={() => {
                setActiveGeoField('plant');
                setIsSelectingLocation(true);
                toast(t('clickMapSelectPlantLocation'), 'success');
              }}
              className="w-full bg-white/[0.04] border border-white/10 text-white py-2 rounded-lg text-xs font-bold"
            >
              📍 {t('selectFromMap')}
            </button>
          </div>

          {/* Mode Selection */}
          <div className="mb-4">
            <label className="text-xs text-slate-400 font-semibold mb-2 block">⚙️ {t('schedulingMode')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('manual')}
                className={`py-2 rounded-lg font-bold text-xs transition ${
                  mode === 'manual' ? 'bg-emerald-500 text-white' : 'bg-white/[0.06] text-slate-400'
                }`}
              >
                ✍️ {t('manual')}
              </button>
              <button
                onClick={() => setMode('auto')}
                className={`py-2 rounded-lg font-bold text-xs transition ${
                  mode === 'auto' ? 'bg-emerald-500 text-white' : 'bg-white/[0.06] text-slate-400'
                }`}
              >
                🤖 {t('auto')}
              </button>
            </div>
          </div>

          {/* Customer Form */}
          <div className="mb-4 p-4 bg-[#0B111E] rounded-lg border border-white/10">
            <label className="text-xs text-sky-400 font-bold mb-2 block">👥 {t('addCustomer')}</label>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value })}
                placeholder={t('customerCode')}
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              />
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder={t('phone')}
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              />
            </div>

            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder={t('customerName')}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] mb-2"
            />

            <input
              value={form.project}
              onChange={e => setForm({ ...form, project: e.target.value })}
              placeholder={t('projectName')}
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] mb-2"
            />

            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={form.paymentType}
                onChange={e => setForm({ ...form, paymentType: e.target.value })}
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              >
                <option value="cash">💵 {t('cash')}</option>
                <option value="credit">📋 {t('credit')}</option>
                <option value="debt">📌 {t('debt')}</option>
              </select>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              >
                <option value="A">🏆 {t('categoryA')}</option>
                <option value="B">⭐ {t('categoryB')}</option>
                <option value="C">📍 {t('categoryC')}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={form.orderType}
                onChange={e => setForm({ ...form, orderType: e.target.value })}
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              >
                <option value="ready-mix">🚚 {t('readyMix')}</option>
                <option value="blocks">🧱 {t('blocks')}</option>
              </select>
              <select
                value={form.elementType}
                onChange={e => setForm({ ...form, elementType: e.target.value })}
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              >
                <option value="foundation">🏗️ {t('elementFoundation')}</option>
                <option value="columns">🏛️ {t('elementColumns')}</option>
                <option value="slab">🏠 {t('elementSlab')}</option>
                <option value="walls">🧱 {t('elementWalls')}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <input
                type="number"
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                placeholder={t('priority')}
                min="1"
                max="10"
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              />
              <input
                type="number"
                value={form.qty}
                onChange={e => setForm({ ...form, qty: e.target.value })}
                placeholder={t('quantity')}
                step="0.1"
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <select
                value={form.concreteType}
                onChange={e => setForm({ ...form, concreteType: e.target.value })}
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              >
                <option value="C25">C25</option>
                <option value="C30">C30</option>
                <option value="C35">C35</option>
                <option value="C40">C40</option>
              </select>
              <input
                value={form.slump}
                onChange={e => setForm({ ...form, slump: e.target.value })}
                placeholder={t('slumpCm')}
                className="bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)]"
              />
            </div>

            {/* Location */}
            <div className="mb-2">
              <input
                value={form.geo}
                readOnly
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs mb-1"
                placeholder={t('locationCoords')}
              />
              {form.locationName && (
                <p className="text-[10px] text-slate-400 mb-1">{form.locationName}</p>
              )}
              <button
                onClick={() => {
                  setActiveGeoField('customer');
                  setIsSelectingLocation(true);
                  toast(t('clickMapSelectCustomerLocation'), 'success');
                }}
                className="w-full bg-white/[0.04] border border-white/10 text-white py-2 rounded-lg text-xs font-bold"
              >
                📍 {t('selectFromMap')}
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-400 mb-2">
              <input
                type="checkbox"
                checked={form.ignoreRestrictions}
                onChange={e => setForm({ ...form, ignoreRestrictions: e.target.checked })}
                className="w-4 h-4"
              />
              ⏭️ {t('ignoreTimeRestrictions')}
            </label>

            <button
              onClick={addCustomer}
              className="w-full bg-white/[0.04] border border-white/10 text-white py-2 rounded-lg text-sm font-bold"
            >
              ➕ {t('addCustomer')}
            </button>
          </div>

          {/* Restrictions */}
          <div className="mb-4 p-4 bg-[#0B111E] rounded-lg border border-white/10">
            <label className="text-xs text-sky-400 font-bold mb-2 block">⏸️ {t('timeRestrictions')}</label>
            {restrictions.map((r, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  type="time"
                  value={r.start}
                  onChange={e => {
                    const newRestrictions = [...restrictions];
                    newRestrictions[i].start = e.target.value;
                    setRestrictions(newRestrictions);
                  }}
                  className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] [color-scheme:dark]"
                />
                <span className="text-slate-400">→</span>
                <input
                  type="time"
                  value={r.end}
                  onChange={e => {
                    const newRestrictions = [...restrictions];
                    newRestrictions[i].end = e.target.value;
                    setRestrictions(newRestrictions);
                  }}
                  className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] [color-scheme:dark]"
                />
                <button
                  onClick={() => setRestrictions(restrictions.filter((_, idx) => idx !== i))}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setRestrictions([...restrictions, { start: '', end: '' }])}
              className="w-full bg-white/[0.06] hover:bg-white/[0.1] text-white py-2 rounded-lg text-xs"
            >
              + {t('addRestriction')}
            </button>
          </div>

          {/* Added Customers */}
          {customers.length > 0 && (
            <div className="mb-4">
              <label className="text-xs text-sky-400 font-bold mb-2 block">📋 {t('addedCustomers')} ({customers.length})</label>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {customers.map((c, i) => (
                  <div key={i} className="bg-[#0B111E] border border-white/10 rounded-lg p-3 text-xs">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-white">[{c.code}] {c.name}</span>
                      <button
                        onClick={() => removeCustomer(i)}
                        className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-[10px]"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="text-slate-400 space-y-1">
                      <p>📱 {c.phone} | 📍 {c.project}</p>
                      <p>💰 {c.paymentType} | 🏆 <span className={c.category === 'A' ? 'text-orange-400' : c.category === 'B' ? 'text-sky-400' : 'text-emerald-400'}>{c.category}</span></p>
                      <p>📦 {c.orderType} | ⭐ {c.priority} | 📐 {c.qty} m³ | {c.concreteType}</p>
                      {c.ignoreRestrictions && <span className="bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded text-[10px] font-bold">⏭️ {t('ignore')}</span>}
                    </div>
                    {c.time && (
                      <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/30 rounded">
                        <span className="text-emerald-400 font-bold">🕐 {c.time}</span>
                        {mode === 'manual' && (
                          <input
                            type="time"
                            value={c.time}
                            onChange={e => {
                              const newCustomers = [...customers];
                              newCustomers[i].time = e.target.value;
                              setCustomers(newCustomers);
                            }}
                            className="ml-2 bg-white/[0.04] border border-emerald-500/30 rounded p-1 text-white text-[10px] [color-scheme:dark]"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={generateSchedule}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg text-sm font-bold shadow-[0_0_20px_rgba(56,189,248,0.3)]"
            >
              🤖 {t('generateSchedule')}
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="w-full bg-sky-500 hover:bg-sky-400 text-white py-3 rounded-lg text-sm font-bold"
            >
              📦 {t('importFromOrders')}
            </button>
          </div>
        </div>

        {/* Right Panel - Map */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" />
          {isSelectingLocation && (
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-slate-900 px-4 py-2 rounded-lg font-bold text-sm shadow-lg">
              📍 {t('clickMapSelectLocation')}
            </div>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed bottom-8 right-8 px-6 py-3 rounded-lg shadow-lg font-bold text-sm ${
          showToast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {showToast.message}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#0B111E]/95 border border-white/10 rounded-xl p-6 max-w-md w-full">
            <h2 className="text-lg font-black tracking-tight text-white mb-4">📦 {t('importFromOrders')}</h2>
            <p className="text-sm text-slate-300 mb-4">
              {t('chooseImportType')}
            </p>
            <div className="space-y-2 mb-4">
              <button
                onClick={() => handleImportFromOrders('all')}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg text-sm font-bold shadow-[0_0_20px_rgba(56,189,248,0.3)]"
              >
                ✅ {t('importAllApprovedOrders')}
              </button>
              <button
                onClick={() => handleImportFromOrders('pending')}
                className="w-full bg-sky-500 hover:bg-sky-400 text-white py-3 rounded-lg text-sm font-bold"
              >
                📅 {t('importScheduledOrdersOnly')}
              </button>
            </div>
            <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3 mb-4">
              <p className="text-xs text-slate-300">
                💡 {t('importNote')}
              </p>
            </div>
            <button
              onClick={() => setShowImportModal(false)}
              className="w-full bg-white/[0.06] hover:bg-white/[0.1] text-white py-2 rounded-lg text-sm font-bold"
            >
              ❌ {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <PlantLogo username={currentUser?.username || ''} height={48} />
                <div>
                  <h2 className="text-lg font-bold text-slate-800">📋 {t('optimizedScheduleReport')}</h2>
                  <p className="text-xs text-slate-500">🟢 {currentUser?.plantName || ''}</p>
                </div>
              </div>
              <button
                onClick={() => setShowReport(false)}
                className="text-2xl text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              {t('date')}: {scheduleDate} | {t('mode')}: {mode === 'manual' ? `${t('manual')} ✍️` : `${t('autoOptimized')} 🤖`}
            </p>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="p-2 border">#</th>
                  <th className="p-2 border">{t('code')}</th>
                  <th className="p-2 border">{t('customer')}</th>
                  <th className="p-2 border">{t('phone')}</th>
                  <th className="p-2 border">{t('project')}</th>
                  <th className="p-2 border">{t('type')}</th>
                  <th className="p-2 border">{t('element')}</th>
                  <th className="p-2 border">{t('pay')}</th>
                  <th className="p-2 border">{t('cat')}</th>
                  <th className="p-2 border">{t('prio')}</th>
                  <th className="p-2 border">{t('qty')}</th>
                  <th className="p-2 border">{t('concrete')}</th>
                  <th className="p-2 border">{t('slump')}</th>
                  <th className="p-2 border">{t('distance')}</th>
                  <th className="p-2 border">{t('duration')}</th>
                  <th className="p-2 border">{t('time')}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((item, i) => {
                  const route = routes[i];
                  const categoryBadge = item.category === 'A' ? 'bg-orange-500' : item.category === 'B' ? 'bg-yellow-500' : 'bg-blue-600';
                  return (
                    <tr key={i} className="border-b text-center">
                      <td className="p-2 border">{i + 1}</td>
                      <td className="p-2 border font-bold">{item.code}</td>
                      <td className="p-2 border">{item.name}</td>
                      <td className="p-2 border">{item.phone}</td>
                      <td className="p-2 border">{item.project}</td>
                      <td className="p-2 border">{item.orderType}</td>
                      <td className="p-2 border">{item.elementType}</td>
                      <td className="p-2 border">
                        {item.paymentType === 'cash' ? '💵' : item.paymentType === 'credit' ? '📋' : '📌'}
                      </td>
                      <td className="p-2 border">
                        <span className={`px-2 py-0.5 rounded text-white text-[10px] font-bold ${categoryBadge}`}>
                          {item.category}
                        </span>
                      </td>
                      <td className="p-2 border">{item.priority}</td>
                      <td className="p-2 border">{item.qty}</td>
                      <td className="p-2 border">{item.concreteType}</td>
                      <td className="p-2 border">{item.slump}</td>
                      <td className="p-2 border">{route?.distance.toFixed(1) || '0'} km</td>
                      <td className="p-2 border">{route?.duration || 0} min</td>
                      <td className="p-2 border font-bold">
                        {item.time} {item.ignoreRestrictions ? '⏭️' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={exportToExcel}
                className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-5 py-2 rounded text-sm"
              >
                📊 {t('downloadCsv')}
              </button>
              <button
                onClick={printReport}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2 rounded text-sm"
              >
                🖨️ {t('print')}
              </button>
              <button
                onClick={() => setShowReport(false)}
                className="bg-slate-500 hover:bg-slate-600 text-white font-bold px-5 py-2 rounded text-sm"
              >
                ✕ {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
