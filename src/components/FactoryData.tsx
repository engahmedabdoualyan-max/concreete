import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { loadAssets, saveAssets, loadInventory, saveInventory, loadWorkshopConfig, saveWorkshopConfig } from '../firebase/firestore';
import { saveGpsLocationToSupabase } from '../supabase/supabase';

interface Asset {
  id: string; plate: string; chassis: string; type: string; status: string; driver: string;
  initOdo: number; engHours: number; regExpiry: string; insExpiry: string; opcardExpiry: string; authExpiry: string;
  gpsId: string; tare: string; gross: string;
  gpsLat?: number; gpsLng?: number; productionRate?: number; capacity?: number; model?: string; year?: string; manufacturer?: string;
}

const DEF_ASSETS: Asset[] = [
  { id: 'm01', plate: '1234 XAD', chassis: 'WDB123456', type: 'Mixer', status: 'Ready', driver: 'Ahmed Ali', initOdo: 50000, engHours: 2400, regExpiry: '2026-12-30', insExpiry: '2026-11-15', opcardExpiry: '2026-10-01', authExpiry: '2026-09-20', gpsId: 'IMEI-869234', tare: '15', gross: '40' },
  { id: 'm04', plate: '5678 BCD', chassis: 'WDB789012', type: 'Mixer', status: 'Workshop', driver: 'Mohamed Sami', initOdo: 62000, engHours: 2900, regExpiry: '2026-08-22', insExpiry: '2026-07-10', opcardExpiry: '2026-06-30', authExpiry: '2026-05-15', gpsId: 'IMEI-869235', tare: '15', gross: '40' },
];

const DEF_STOCK: Record<string, number> = { cement: 85, sand: 156, gravel: 270, admixture: 1700 };

const STOCK_META = [
  { key: 'cement', name: 'Cement', unit: 't', min: 20 },
  { key: 'sand', name: 'Sand', unit: 't', min: 40 },
  { key: 'gravel', name: 'Gravel / Aggregate', unit: 't', min: 60 },
  { key: 'admixture', name: 'Admixture', unit: 'L', min: 300 },
];

export type FactorySection = 'fleet' | 'stock' | 'config';

export default function FactoryData({ onToast, section }: { onToast: (msg: string) => void; section?: FactorySection }) {
  const { currentUser } = useAuth();
  const { t } = useLang();
  const showAll = !section;
  const [assets, setAssets] = useState<Asset[]>([]);
  const [stock, setStock] = useState<Record<string, number>>(DEF_STOCK);
  const [config, setConfig] = useState<any>({ stationName: 'Model Plant', targetProd: '12000', productType: 'concrete' });
  const [loaded, setLoaded] = useState(false);
  const [assetForm, setAssetForm] = useState<any>({ id: '', plate: '', chassis: '', type: 'Mixer', status: 'Ready', driver: '', initOdo: '', engHours: '', regExpiry: '', insExpiry: '', opcardExpiry: '', authExpiry: '', gpsId: '', gpsProvider: 'Traccar', tare: '', gross: '', gpsLat: '', gpsLng: '', productionRate: '', capacity: '', model: '', year: '', manufacturer: '' });
  const [gpsBusyId, setGpsBusyId] = useState('');
  const [gpsMsg, setGpsMsg] = useState('');

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([loadAssets(currentUser.username), loadInventory(currentUser.username), loadWorkshopConfig(currentUser.username)])
      .then(([a, i, c]) => {
        if (Array.isArray(a) && a.length > 0) setAssets(a);
        else setAssets(DEF_ASSETS);
        if (i && typeof i === 'object') setStock({ ...DEF_STOCK, ...i });
        if (c) setConfig({ ...config, ...c });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [currentUser?.username]);

  useEffect(() => { if (!loaded || !currentUser) return; saveAssets(currentUser.username, assets).catch(() => {}); }, [assets, loaded]);
  useEffect(() => { if (!loaded || !currentUser) return; saveInventory(currentUser.username, stock).catch(() => {}); }, [stock, loaded]);
  useEffect(() => { if (!loaded || !currentUser) return; saveWorkshopConfig(currentUser.username, config).catch(() => {}); }, [config, loaded]);

  const setAssetField = (k: string, v: string) => setAssetForm((p: any) => ({ ...p, [k]: v }));

  const addAsset = () => {
    if (!assetForm.id || !assetForm.plate) { onToast('⚠️ ' + t('enterAssetCodePlate')); return; }
    const na: Asset = {
      ...assetForm,
      initOdo: Number(assetForm.initOdo) || 0,
      engHours: Number(assetForm.engHours) || 0,
      gpsLat: assetForm.gpsLat !== '' ? Number(assetForm.gpsLat) : undefined,
      gpsLng: assetForm.gpsLng !== '' ? Number(assetForm.gpsLng) : undefined,
      productionRate: assetForm.productionRate !== '' ? Number(assetForm.productionRate) : undefined,
      capacity: assetForm.capacity !== '' ? Number(assetForm.capacity) : undefined,
    };
    setAssets(prev => prev.some(x => x.id === na.id) ? prev.map(x => x.id === na.id ? na : x) : [...prev, na]);
    if (na.gpsLat && na.gpsLng && currentUser) {
      saveGpsLocationToSupabase({ username: currentUser.username, label: `asset:${na.id}`, lat: na.gpsLat, lng: na.gpsLng }).catch(() => {});
    }
    setAssetForm({ id: '', plate: '', chassis: '', type: 'Mixer', status: 'Ready', driver: '', initOdo: '', engHours: '', regExpiry: '', insExpiry: '', opcardExpiry: '', authExpiry: '', gpsId: '', tare: '', gross: '', gpsLat: '', gpsLng: '', productionRate: '', capacity: '', model: '', year: '', manufacturer: '' });
    onToast(`✅ ${t('assetSaved')} ${na.id} — ${t('visibleAllSections')}.`);
  };

  const deleteAsset = (id: string) => {
    if (!confirm(t('deleteAssetConfirm') + ' ' + id + '?')) return;
    setAssets(prev => prev.filter(a => a.id !== id));
  };

  const editAsset = (a: Asset) => {
    setAssetForm({ ...a, initOdo: String(a.initOdo), engHours: String(a.engHours), gpsLat: a.gpsLat != null ? String(a.gpsLat) : '', gpsLng: a.gpsLng != null ? String(a.gpsLng) : '', productionRate: a.productionRate != null ? String(a.productionRate) : '', capacity: a.capacity != null ? String(a.capacity) : '' });
  };

  const detectAssetGps = (id: string) => {
    setGpsBusyId(id);
    setGpsMsg('');
    if (!navigator.geolocation) { setGpsMsg('⚠️ ' + t('geolocationNotSupported')); setGpsBusyId(''); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        setAssets(prev => prev.map(a => a.id === id ? { ...a, gpsLat: latitude, gpsLng: longitude } : a));
        if (currentUser) saveGpsLocationToSupabase({ username: currentUser.username, label: `asset:${id}`, lat: latitude, lng: longitude }).catch(() => {});
        setGpsMsg(`✅ ${t('gpsSavedForAsset')} ${id} (${latitude.toFixed(5)}, ${longitude.toFixed(5)}).`);
        setGpsBusyId('');
      },
      err => { setGpsMsg(`⚠️ ${err.message}`); setGpsBusyId(''); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const saveStock = (key: string, value: number) => setStock(prev => ({ ...prev, [key]: value }));

  const fieldCls = 'w-full bg-white/[0.04] border border-white/10 text-white rounded-lg focus:outline-none focus:border-sky-400/70 focus:shadow-[0_0_12px_rgba(56,189,248,0.25)] text-sm px-3 py-2';

  return (
    <div className="space-y-8">
      {gpsMsg && <p className={`text-xs font-bold ${gpsMsg.includes('✅') ? 'text-emerald-400' : 'text-yellow-400'}`}>{gpsMsg}</p>}

      {/* ===== Fleet / Equipment ===== */}
      {(showAll || section === 'fleet') && (
      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">🚛 {t('factoryFleetEquipment')}</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-amber-500/20 text-amber-400">{assets.length} {t('assets')}</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">{t('factoryFleetHint')}</p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[{ k: 'id', l: t('assetCode') + ' *' }, { k: 'plate', l: t('plateNumber') + ' *' }, { k: 'chassis', l: t('chassis') }, { k: 'driver', l: t('driverName') }, { k: 'gpsId', l: t('trackerIdImei') }, { k: 'model', l: t('model') }, { k: 'year', l: t('year') }, { k: 'manufacturer', l: t('manufacturer') }].map(f => (
            <div key={f.k}><label className="text-[10px] text-slate-400 font-semibold">{f.l}</label>
              <input value={assetForm[f.k]} onChange={e => setAssetField(f.k, e.target.value)} className={fieldCls} /></div>
          ))}
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('gpsProvider')}</label>
            <select value={assetForm.gpsProvider} onChange={e => setAssetField('gpsProvider', e.target.value)} className={fieldCls}>
              <option>Traccar</option><option>GpsGate</option><option>Teltonika</option><option>{t('manualBrowser')}</option>
            </select></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('assetType')}</label>
            <select value={assetForm.type} onChange={e => setAssetField('type', e.target.value)} className={fieldCls}>
              <option>Mixer</option><option>Mobile Pump</option><option>Light Vehicle</option><option>Loader</option><option>Generator</option><option>Station</option>
            </select></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('status')}</label>
            <select value={assetForm.status} onChange={e => setAssetField('status', e.target.value)} className={fieldCls}>
              <option>Ready</option><option>Workshop</option><option>Out of Service</option><option>Scrap</option>
            </select></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('odometerKm')}</label>
            <input type="number" value={assetForm.initOdo} onChange={e => setAssetField('initOdo', e.target.value)} className={fieldCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('engineHours')}</label>
            <input type="number" value={assetForm.engHours} onChange={e => setAssetField('engHours', e.target.value)} className={fieldCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('capacityM3')}</label>
            <input type="number" value={assetForm.capacity} onChange={e => setAssetField('capacity', e.target.value)} className={fieldCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('productionRateM3h')}</label>
            <input type="number" value={assetForm.productionRate} onChange={e => setAssetField('productionRate', e.target.value)} className={fieldCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('gpsLatitude')}</label>
            <input value={assetForm.gpsLat} onChange={e => setAssetField('gpsLat', e.target.value)} placeholder="24.7136" className={fieldCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('gpsLongitude')}</label>
            <input value={assetForm.gpsLng} onChange={e => setAssetField('gpsLng', e.target.value)} placeholder="46.6753" className={fieldCls} /></div>
        </div>
        <button onClick={addAsset} className="bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-white font-bold py-2.5 px-6 rounded-lg transition-all duration-300 shadow-[0_0_20px_rgba(56,189,248,0.3)]">
          💾 {t('saveAsset')}
        </button>

        {assets.length === 0 ? (
          <p className="text-slate-400 text-center py-8 mt-4">{t('noAssetsYet')}</p>
        ) : (
          <div className="overflow-x-auto mt-5">
            <table className="w-full text-xs text-slate-300">
              <thead className="bg-white/[0.04] text-slate-400"><tr>
                {[t('assetCode'), t('assetType'), t('plateNumber'), t('driverName'), t('status'), t('capacity'), t('prodRate'), t('gpsTracker'), t('position'), t('details'), t('actions')].map(h => <th key={h} className="p-2 text-[10px] uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody>
                {assets.map(a => (
                  <tr key={a.id} className="border-b border-white/10">
                    <td className="p-2 font-bold text-white">{a.id}</td>
                    <td className="p-2">{a.type}</td>
                    <td className="p-2">{a.plate}</td>
                    <td className="p-2">{a.driver}</td>
                    <td className="p-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.status === 'Ready' ? 'bg-emerald-500/20 text-emerald-400' : a.status === 'Workshop' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{a.status}</span></td>
                    <td className="p-2">{a.capacity ?? '—'} m³</td>
                    <td className="p-2">{a.productionRate ?? '—'} m³/h</td>
                    <td className="p-2">{a.gpsId || '—'}</td>
                    <td className="p-2">
                      {a.gpsLat && a.gpsLng ? `${a.gpsLat.toFixed(4)}, ${a.gpsLng.toFixed(4)}` : <span className="text-slate-500">{t('noGps')}</span>}
                      <button onClick={() => detectAssetGps(a.id)} disabled={gpsBusyId === a.id} className="ml-2 bg-sky-600/20 text-sky-400 border border-sky-500/30 text-[10px] px-2 py-1 rounded font-bold hover:bg-sky-600/30 disabled:opacity-50">
                        {gpsBusyId === a.id ? '⏳' : '📍'}
                      </button>
                    </td>
                    <td className="p-2">{a.model || '—'} {a.year ? `· ${a.year}` : ''}</td>
                    <td className="p-2 flex gap-1">
                      <button onClick={() => editAsset(a)} className="bg-sky-500 text-white text-[10px] px-2 py-1 rounded">{t('edit')}</button>
                      <button onClick={() => deleteAsset(a.id)} className="bg-red-600 text-white text-[10px] px-2 py-1 rounded">{t('delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* ===== Raw Material Stock ===== */}
      {(showAll || section === 'stock') && (
      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">🧱 {t('rawMaterialStock')}</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-emerald-500/20 text-emerald-400">{t('sharedInventory')}</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">{t('stockHint')}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {STOCK_META.map(m => (
            <div key={m.key} className="bg-white/[0.04] rounded-xl p-4 border border-white/10">
              <label className="text-[10px] text-slate-400 font-semibold">{t(m.key as any)} · {t('min')} {m.min}{m.unit}</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="number" value={stock[m.key] ?? 0} onChange={e => saveStock(m.key, Number(e.target.value) || 0)} className={fieldCls} />
                <span className="text-xs text-slate-400">{m.unit}</span>
              </div>
              <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${(stock[m.key] ?? 0) <= m.min ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: Math.min(100, ((stock[m.key] ?? 0) / (m.min * 3)) * 100) + '%' }} />
              </div>
              {(stock[m.key] ?? 0) <= m.min && <p className="text-[10px] text-red-400 mt-1">⬇ {t('belowMinimum')}</p>}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ===== Production Config ===== */}
      {(showAll || section === 'config') && (
      <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">🏭 {t('plantProductionProfile')}</h2>
          <span className="text-xs px-2.5 py-1 rounded font-bold bg-sky-500/20 text-sky-400">{t('sharedConfig')}</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">{t('plantConfigHint')}</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('stationPlantName')}</label>
            <input value={config.stationName || ''} onChange={e => setConfig({ ...config, stationName: e.target.value })} className={fieldCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('productType')}</label>
            <select value={config.productType || 'concrete'} onChange={e => setConfig({ ...config, productType: e.target.value })} className={fieldCls}>
              <option value="concrete">🏗️ {t('concrete')}</option><option value="blocks">🧱 {t('blocks')}</option><option value="both">🔄 {t('both')}</option>
            </select></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('targetProduction')}</label>
            <input value={config.targetProd || ''} onChange={e => setConfig({ ...config, targetProd: e.target.value })} className={fieldCls} /></div>
          <div><label className="text-[10px] text-slate-400 font-semibold">{t('fuelEfficiencyTarget')}</label>
            <input value={config.fuelEffTarget || ''} onChange={e => setConfig({ ...config, fuelEffTarget: e.target.value })} className={fieldCls} /></div>
        </div>
      </div>
      )}
    </div>
  );
}
