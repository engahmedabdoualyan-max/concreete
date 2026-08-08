import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdmin, rolePermissions, ROLE_KEYS, MODULE_KEYS, type UserRole } from '../context/AdminContext';
import { useLang } from '../context/LangContext';
import type { Translations } from '../context/translations';
import { useNavigate } from 'react-router-dom';
import LangSelector from '../components/LangSelector';
import { loadPlantGPS, savePlantGPS, getAllPlantsSummary, type PlantSummary } from '../firebase/firestore';
import { loadGpsLocationsFromSupabase } from '../supabase/supabase';
import FactoryData from '../components/FactoryData';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Tab = 'overview' | 'plant' | 'users' | 'sections' | 'gps' | 'factory';

const ROLE_EMOJIS: Record<UserRole, string> = {
  owner: '👑',
  manager: '🧑‍💼',
  operator: '🛠️',
  quality: '🔬',
  maintenance: '🔧',
  viewer: '👁️',
};

const ROLE_T_KEYS: Record<UserRole, keyof Translations> = {
  owner: 'ownerRole',
  manager: 'managerRole',
  operator: 'operatorRole',
  quality: 'qualityRole',
  maintenance: 'maintenanceRole',
  viewer: 'viewerRole',
};

const MODULE_EMOJIS: Record<string, string> = {
  operations: '🚚',
  production: '🏭',
  workshop: '🔧',
  mixing: '🎛️',
  schedule: '📅',
  orders: '📦',
  evaluation: '📊',
  rnd: '🔬',
};

const MODULE_T_KEYS: Record<string, keyof Translations> = {
  operations: 'modOperations',
  production: 'modProduction',
  workshop: 'modWorkshop',
  mixing: 'modMixing',
  schedule: 'modSchedule',
  orders: 'modOrders',
  evaluation: 'modEvaluation',
  rnd: 'modRnd',
};

function Field({ label, value, onChange, type = 'text', rows }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; rows?: number;
}) {
  const base = 'w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      {rows ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} className={base} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} className={base} />
      )}
    </div>
  );
}

export default function AdminPanel() {
  const { currentUser } = useAuth();
  const { plant, savePlant, users, addUser, updateUser, deleteUser, canManageAdmin } = useAdmin();
  const { t } = useLang();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('overview');
  const [toast, setToast] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState('');

  const [plantForm, setPlantForm] = useState(plant);
  const [newUser, setNewUser] = useState({ username: '', password: '', name: '', email: '', phone: '', plantName: '', role: 'operator' as UserRole });

  const [plantGps, setPlantGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');
  const [summary, setSummary] = useState<PlantSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [supaGps, setSupaGps] = useState<Array<{ username: string; label: string; lat: number; lng: number }>>([]);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObjRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    loadPlantGPS(currentUser.username).then(g => {
      if (g) setPlantGps(g);
    }).catch(() => {});
    loadGpsLocationsFromSupabase().then(rows => {
      setSupaGps(rows.map(r => ({ username: r.username, label: r.label, lat: r.lat, lng: r.lng })));
    }).catch(() => {});
  }, [currentUser?.username]);

  const detectGps = () => {
    setGpsBusy(true);
    setGpsMsg('');
    if (!navigator.geolocation) {
      setGpsMsg('⚠️ Geolocation is not supported by this browser.');
      setGpsBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords;
        setPlantGps({ lat: latitude, lng: longitude });
        try { await savePlantGPS(currentUser!.username, latitude, longitude); } catch {}
        setGpsMsg(`✅ GPS saved (${latitude.toFixed(5)}, ${longitude.toFixed(5)}). Now used by all sections.`);
        setGpsBusy(false);
      },
      err => {
        setGpsMsg(`⚠️ ${err.message} — allow location access or enter coordinates manually.`);
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const loadSectionSummary = async () => {
    setSummaryLoading(true);
    try {
      const s = await getAllPlantsSummary();
      setSummary(s);
    } catch {}
    setSummaryLoading(false);
  };

  useEffect(() => {
    if (tab !== 'sections') return;
    loadSectionSummary();
  }, [tab]);

  useEffect(() => {
    if (tab !== 'gps' || !mapRef.current) return;
    if (mapObjRef.current) {
      mapObjRef.current.remove();
      mapObjRef.current = null;
    }
    const center: [number, number] = plantGps ? [plantGps.lat, plantGps.lng] : [24.7136, 46.6753];
    const map = L.map(mapRef.current).setView(center, 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    const plantIcon = L.divIcon({ html: '🏭', className: '', iconSize: [24, 24] });
    if (plantGps) {
      L.marker([plantGps.lat, plantGps.lng], { icon: plantIcon }).addTo(map).bindPopup('<b>Plant HQ</b>').openPopup();
    } else {
      L.marker(center, { icon: plantIcon }).addTo(map).bindPopup('<b>Default plant position</b>');
    }
    const truckIcon = L.divIcon({ html: '🚚', className: '', iconSize: [22, 22] });
    const trucks: Array<{ lat: number; lng: number; code: string }> = [];
    summary.forEach(s => (Array.isArray(s.tripList) ? s.tripList : []).forEach(t => {
      if (typeof t.siteGeo === 'string' && t.siteGeo.includes(',')) {
        const [lat, lng] = t.siteGeo.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) trucks.push({ lat, lng, code: t.code || s.username });
      }
    }));
    supaGps.forEach(s => trucks.push({ lat: s.lat, lng: s.lng, code: `${s.username}/${s.label}` }));
    trucks.forEach(tr => L.marker([tr.lat, tr.lng], { icon: truckIcon }).addTo(map).bindPopup(`<b>${tr.code}</b>`));
    if (trucks.length > 0) {
      const all: [number, number][] = [[center[0], center[1]], ...trucks.map(t => [t.lat, t.lng] as [number, number])];
      map.fitBounds(L.latLngBounds(all));
    }
    mapObjRef.current = map;
    return () => { if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; } };
  }, [tab, plantGps, summary, supaGps]);

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  if (!canManageAdmin()) {
    navigate('/');
    return null;
  }

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSavePlant = (e: FormEvent) => {
    e.preventDefault();
    savePlant(plantForm);
    showToast(t('plantSaved'));
  };

  const handleAddUser = (e: FormEvent) => {
    e.preventDefault();
    if (!newUser.username || !newUser.password) {
      setAddError(t('username') + ' / ' + t('password'));
      return;
    }
    const ok = addUser({
      username: newUser.username,
      password: newUser.password,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      plantName: newUser.plantName,
      country: 'Other',
      city: 'Other',
      role: newUser.role,
      isActive: true,
      permissions: rolePermissions(newUser.role),
    });
    if (!ok) {
      setAddError(t('username'));
      return;
    }
    setAddError('');
    setNewUser({ username: '', password: '', name: '', email: '', phone: '', plantName: '', role: 'operator' });
    setShowAdd(false);
    showToast(t('userAdded'));
  };

  const activeCount = users.filter(u => u.isActive).length;
  const tabs: { key: Tab; label: string; emoji: string }[] = [
    { key: 'overview', label: t('tabOverview'), emoji: '📊' },
    { key: 'plant', label: t('tabPlantData'), emoji: '🏭' },
    { key: 'factory', label: 'Factory Assets & Stock', emoji: '🚛' },
    { key: 'users', label: t('tabUsers'), emoji: '👥' },
    { key: 'sections', label: 'Sections Overview', emoji: '🧩' },
    { key: 'gps', label: 'GPS Map', emoji: '🗺️' },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f1f5f9] py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">⚙️ {t('adminPanelTitle')}</h1>
            <p className="text-slate-400">{t('adminPanelSubtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <LangSelector />
            <button
              onClick={() => navigate('/')}
              className="bg-[#334155] hover:bg-[#3f4863] text-white px-5 py-2.5 rounded-lg font-bold transition-all duration-300"
            >
              ← {t('backToDashboard')}
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(tb => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-300 border ${
                tab === tb.key
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                  : 'bg-[#1e293b] text-slate-300 border-[#334155] hover:bg-[#263449]'
              }`}
            >
              {tb.emoji} {tb.label}
            </button>
          ))}
        </div>

        {toast && (
          <div className="mb-6 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-lg font-bold text-sm">
            ✅ {toast}
          </div>
        )}

        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">🏭 {t('plantName')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.name || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">📍 {t('location')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.city || '—'}{plant.city && plant.country ? ', ' : ''}{plant.country || ''}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">📏 {t('capacityM3')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.capacityM3 || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">📅 {t('foundingYear')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.foundingYear || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">🎛️ {t('mixerCount')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.mixerCount || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">🚛 {t('truckCount')}</p>
                <p className="text-lg font-bold text-white truncate">{plant.truckCount || '—'}</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">👥 {t('tabUsers')}</p>
                <p className="text-lg font-bold text-white truncate">{users.length} ({activeCount} {t('isActive')})</p>
              </div>
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <p className="text-xs text-slate-400 font-semibold mb-1">🧩 {t('permissions')}</p>
                <p className="text-lg font-bold text-white truncate">{MODULE_KEYS.length} {t('module')}</p>
              </div>
            </div>

            <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
              <h2 className="text-lg font-bold text-white mb-3">👥 {t('tabUsers')}</h2>
              {users.length === 0 ? (
                <p className="text-slate-400">{t('noUsers')}</p>
              ) : (
                <div className="space-y-2">
                  {users.map(u => (
                    <div key={u.username} className="flex items-center justify-between bg-[#0f172a] rounded-lg px-4 py-3 border border-[#334155]">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{ROLE_EMOJIS[u.role]}</span>
                        <div>
                          <p className="font-bold text-white">{u.name || u.username}</p>
                          <p className="text-xs text-slate-400">@{u.username} · {u.role}</p>
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded font-bold ${
                        u.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {u.isActive ? '🟢 ' + t('isActive') : '🔴 ' + t('inactive')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'plant' && (
          <form onSubmit={handleSavePlant} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-8">
            <h2 className="text-xl font-bold text-white mb-6">🏭 {t('tabPlantData')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Field label={t('plantName')} value={plantForm.name} onChange={v => setPlantForm({ ...plantForm, name: v })} />
              <Field label={t('managerName')} value={plantForm.manager} onChange={v => setPlantForm({ ...plantForm, manager: v })} />
              <Field label={t('address')} value={plantForm.address} onChange={v => setPlantForm({ ...plantForm, address: v })} />
              <Field label={t('city')} value={plantForm.city} onChange={v => setPlantForm({ ...plantForm, city: v })} />
              <Field label={t('country')} value={plantForm.country} onChange={v => setPlantForm({ ...plantForm, country: v })} />
              <Field label={t('phone')} value={plantForm.phone} onChange={v => setPlantForm({ ...plantForm, phone: v })} />
              <Field label={t('email')} type="email" value={plantForm.email} onChange={v => setPlantForm({ ...plantForm, email: v })} />
              <Field label={t('licenseNumber')} value={plantForm.licenseNumber} onChange={v => setPlantForm({ ...plantForm, licenseNumber: v })} />
              <Field label={t('capacityM3')} value={plantForm.capacityM3} onChange={v => setPlantForm({ ...plantForm, capacityM3: v })} />
              <div className="grid grid-cols-2 gap-5">
                <Field label={t('mixerCount')} value={plantForm.mixerCount} onChange={v => setPlantForm({ ...plantForm, mixerCount: v })} />
                <Field label={t('truckCount')} value={plantForm.truckCount} onChange={v => setPlantForm({ ...plantForm, truckCount: v })} />
              </div>
              <Field label={t('foundingYear')} value={plantForm.foundingYear} onChange={v => setPlantForm({ ...plantForm, foundingYear: v })} />
            </div>
            <div className="mt-5">
              <Field label={t('notes')} rows={3} value={plantForm.notes} onChange={v => setPlantForm({ ...plantForm, notes: v })} />
            </div>
            <div className="mt-5 bg-[#0f172a] border border-[#334155] rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div>
                  <p className="font-bold text-white text-sm">📍 Plant GPS (shared across all sections)</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {plantGps ? `Saved: ${plantGps.lat.toFixed(5)}, ${plantGps.lng.toFixed(5)}` : 'No GPS saved yet — detect your location or enter coordinates manually.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={detectGps}
                  disabled={gpsBusy}
                  className="bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-300"
                >
                  {gpsBusy ? '⏳ Detecting...' : '📍 Detect My Location'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Latitude" value={plantGps ? String(plantGps.lat) : ''} onChange={v => setPlantGps(p => ({ lat: Number(v) || 0, lng: p?.lng || 0 }))} />
                <Field label="Longitude" value={plantGps ? String(plantGps.lng) : ''} onChange={v => setPlantGps(p => ({ lat: p?.lat || 0, lng: Number(v) || 0 }))} />
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3 mt-3">
                {gpsMsg && <p className={`text-xs font-bold ${gpsMsg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'}`}>{gpsMsg}</p>}
                <button
                  type="button"
                  onClick={async () => {
                    if (!plantGps) { setGpsMsg('⚠️ Enter latitude/longitude first.'); return; }
                    try {
                      await savePlantGPS(currentUser!.username, plantGps.lat, plantGps.lng);
                      const { saveGpsLocationToSupabase } = await import('../supabase/supabase');
                      await saveGpsLocationToSupabase({ username: currentUser!.username, label: 'plant', lat: plantGps.lat, lng: plantGps.lng });
                      const rows = await loadGpsLocationsFromSupabase();
                      setSupaGps(rows.map(r => ({ username: r.username, label: r.label, lat: r.lat, lng: r.lng })));
                      setGpsMsg(`✅ GPS saved (${plantGps.lat.toFixed(5)}, ${plantGps.lng.toFixed(5)}).`);
                    } catch { setGpsMsg('⚠️ Could not save GPS.'); }
                  }}
                  className="ml-auto bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 text-xs px-4 py-2 rounded-lg font-bold transition-colors"
                >
                  💾 Save GPS
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-6 border-t border-[#334155] mt-6">
              <button
                type="submit"
                className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-8 py-3 rounded-lg font-bold transition-all duration-300"
              >
                💾 {t('save')}
              </button>
            </div>
          </form>
        )}

        {tab === 'users' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">👥 {t('tabUsers')}</h2>
              <button
                onClick={() => { setShowAdd(!showAdd); setAddError(''); }}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-2.5 rounded-lg font-bold transition-all duration-300"
              >
                {showAdd ? '✖ ' + t('cancel') : '➕ ' + t('addUser')}
              </button>
            </div>

            {showAdd && (
              <form onSubmit={handleAddUser} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                <h3 className="font-bold text-white mb-4">➕ {t('addUser')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label={t('username') + ' *'} value={newUser.username} onChange={v => setNewUser({ ...newUser, username: v })} />
                  <Field label={t('password') + ' *'} value={newUser.password} onChange={v => setNewUser({ ...newUser, password: v })} />
                  <Field label={t('fullName')} value={newUser.name} onChange={v => setNewUser({ ...newUser, name: v })} />
                  <Field label={t('email')} type="email" value={newUser.email} onChange={v => setNewUser({ ...newUser, email: v })} />
                  <Field label={t('phone')} value={newUser.phone} onChange={v => setNewUser({ ...newUser, phone: v })} />
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">{t('role')}</label>
                    <select
                      value={newUser.role}
                      onChange={e => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                      className="w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {ROLE_KEYS.map(r => <option key={r} value={r}>{ROLE_EMOJIS[r]} {t(ROLE_T_KEYS[r])}</option>)}
                    </select>
                  </div>
                </div>
                {addError && <p className="text-red-400 text-sm mt-3">⚠️ {t('username')} {t('status')}</p>}
                <div className="flex justify-end pt-4">
                  <button type="submit" className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white px-8 py-2.5 rounded-lg font-bold transition-all duration-300">
                    ➕ {t('addUser')}
                  </button>
                </div>
              </form>
            )}

            {users.length === 0 ? (
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-10 text-center text-slate-400">{t('noUsers')}</div>
            ) : (
              users.map(u => (
                <div key={u.username} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{ROLE_EMOJIS[u.role]}</span>
                      <div>
                        <p className="font-bold text-white text-lg">{u.name || u.username}</p>
                        <p className="text-xs text-slate-400">@{u.username}{u.plantName ? ' · ' + u.plantName : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded font-bold ${
                        u.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {u.isActive ? '🟢 ' + t('isActive') : '🔴 ' + t('inactive')}
                      </span>
                      <button
                        onClick={() => deleteUser(u.username)}
                        className="bg-red-500/15 text-red-400 text-xs px-3 py-1.5 rounded-lg font-bold border border-red-500/30 hover:bg-red-500/30 transition-colors"
                      >
                        🗑️ {t('deleteUser')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">👑 {t('role')}</label>
                      <select
                        value={u.role}
                        onChange={e => updateUser({ ...u, role: e.target.value as UserRole, permissions: rolePermissions(e.target.value as UserRole) })}
                        className="w-full px-3 py-2 bg-[#0f172a] border border-[#334155] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {ROLE_KEYS.map(r => <option key={r} value={r}>{ROLE_EMOJIS[r]} {t(ROLE_T_KEYS[r])}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer bg-[#0f172a] border border-[#334155] rounded-lg px-4 py-2 w-full">
                        <input
                          type="checkbox"
                          checked={u.isActive}
                          onChange={e => updateUser({ ...u, isActive: e.target.checked })}
                          className="w-4 h-4 accent-emerald-500"
                        />
                        <span className="text-sm font-medium text-slate-300">{t('isActive')}</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-300 mb-2">🧩 {t('permissions')}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {MODULE_KEYS.map(mod => (
                        <label key={mod} className="flex items-center gap-2 cursor-pointer bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2">
                          <input
                            type="checkbox"
                            checked={!!u.permissions[mod]}
                            disabled={u.role === 'owner' || u.role === 'manager'}
                            onChange={e => updateUser({ ...u, permissions: { ...u.permissions, [mod]: e.target.checked } })}
                            className="w-4 h-4 accent-blue-500"
                          />
                          <span className="text-xs text-slate-300">{MODULE_EMOJIS[mod]} {t(MODULE_T_KEYS[mod])}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'sections' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">🧩 Sections Overview</h2>
              <button
                onClick={loadSectionSummary}
                disabled={summaryLoading}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-bold text-sm transition-all duration-300"
              >
                {summaryLoading ? '⏳ Loading...' : '🔄 Refresh'}
              </button>
            </div>
            <p className="text-sm text-slate-400 -mt-3">Live aggregates from every section's database (trips, QC, orders, payments, purchase orders).</p>

            {summaryLoading ? (
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-10 text-center text-slate-400">⏳ Loading section data...</div>
            ) : summary.length === 0 ? (
              <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-10 text-center text-slate-400">No plants found yet.</div>
            ) : (
              summary.map(s => {
                const collected = Array.isArray(s.payments) ? s.payments.reduce((x, p) => x + (Number(p.amountPaid) || Number(p.amount) || 0), 0) : 0;
                const posSpend = Array.isArray(s.pos) ? s.pos.reduce((x, p) => x + (Number(p.total) || 0), 0) : 0;
                const openOrders = Array.isArray(s.orders) ? s.orders.filter(o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length : 0;
                const inventoryRows = s.inventory && typeof s.inventory === 'object' ? Object.entries(s.inventory) : [];
                return (
                  <div key={s.username} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-white text-lg">🏭 {s.plantName} <span className="text-xs text-slate-500">(@{s.username} · {s.city}, {s.country})</span></h3>
                      <span className="text-xs px-2.5 py-1 rounded font-bold bg-blue-500/20 text-blue-400">{s.trips} trips</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-[#0f172a] rounded-xl p-4"><p className="text-xs text-slate-400">🚛 Trips</p><p className="text-2xl font-bold text-white">{s.trips}</p></div>
                      <div className="bg-[#0f172a] rounded-xl p-4"><p className="text-xs text-slate-400">📦 Volume</p><p className="text-2xl font-bold text-white">{Math.round(s.totalVolume)} m³</p></div>
                      <div className="bg-[#0f172a] rounded-xl p-4"><p className="text-xs text-slate-400">🔬 QC Samples</p><p className="text-2xl font-bold text-white">{s.qcCount}</p></div>
                      <div className="bg-[#0f172a] rounded-xl p-4"><p className="text-xs text-slate-400">📋 Open Orders</p><p className="text-2xl font-bold text-white">{openOrders}</p></div>
                      <div className="bg-[#0f172a] rounded-xl p-4"><p className="text-xs text-slate-400">💰 Collected</p><p className="text-2xl font-bold text-emerald-400">{Math.round(collected)} SAR</p></div>
                      <div className="bg-[#0f172a] rounded-xl p-4"><p className="text-xs text-slate-400">🛒 PO Spend</p><p className="text-2xl font-bold text-amber-400">{Math.round(posSpend)} SAR</p></div>
                    </div>
                    {inventoryRows.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-slate-300 mb-2">📦 Inventory</p>
                        <div className="flex flex-wrap gap-2">
                          {inventoryRows.map(([k, v]) => (
                            <span key={k} className="text-xs bg-[#0f172a] border border-[#334155] px-3 py-1.5 rounded-lg text-slate-300">{k}: <b className="text-white">{String(v)}</b></span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {tab === 'factory' && (
          <FactoryData onToast={showToast} />
        )}

        {tab === 'gps' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">🗺️ GPS Map</h2>
              <div className="flex gap-2">
                <button onClick={detectGps} disabled={gpsBusy} className="bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-bold text-sm transition-all duration-300">
                  {gpsBusy ? '⏳ Detecting...' : '📍 Detect My Location'}
                </button>
                <button onClick={() => { loadSectionSummary(); }} className="bg-[#334155] hover:bg-[#3f4863] text-white px-5 py-2 rounded-lg font-bold text-sm transition-all duration-300">
                  🔄 Reload
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-400 -mt-3">
              🏭 Plant HQ · 🚚 active trips (from operations) · shared GPS markers from Supabase.
            </p>
            {gpsMsg && <p className={`text-xs font-bold ${gpsMsg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'}`}>{gpsMsg}</p>}
            {plantGps && <p className="text-xs text-slate-400">Plant GPS: <b className="text-white">{plantGps.lat.toFixed(5)}, {plantGps.lng.toFixed(5)}</b></p>}
            <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-4">
              <div ref={mapRef} className="w-full h-[520px] rounded-xl overflow-hidden z-0" />
            </div>
            <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-4">
              <p className="text-sm font-bold text-white mb-3">🛰️ Shared GPS locations (Supabase)</p>
              {supaGps.length === 0 ? (
                <p className="text-xs text-slate-400">No GPS markers in Supabase yet. Save one from the Plant tab or Operations.</p>
              ) : (
                <div className="space-y-2">
                  {supaGps.map(g => (
                    <div key={g.username + g.label} className="flex items-center justify-between bg-[#0f172a] rounded-lg px-4 py-2 border border-[#334155]">
                      <span className="text-sm text-slate-300">📍 <b className="text-white">{g.username}</b> / {g.label}</span>
                      <span className="text-xs text-slate-400">{g.lat.toFixed(5)}, {g.lng.toFixed(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
