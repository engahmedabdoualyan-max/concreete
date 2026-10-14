import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSitesDict } from '../i18n/sitesDict';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';
import QuickJump from '../components/QuickJump';
import SiteMap from '../components/SiteMap';
import FleetPositions from '../components/FleetPositions';

/**
 * ============================================================
 *  Plant & Branch Locations — /sites
 * ============================================================
 *  "مواقع المصنع والفروع": where this company physically operates.
 *
 *  Everything here talks to /api/sites (Postgres), NOT to the Firestore-backed
 *  "بيانات الشركة" screen in the Console. That split is deliberate and load-
 *  bearing: the fleet, the GPS trackers and the telemetry that would consume
 *  these coordinates are all Postgres, so a coordinate saved only to Firestore
 *  is a coordinate the vehicle monitoring cannot read. The company screen gets a
 *  link to this page rather than a second copy of the same fields, so there is
 *  one place a plant location is ever edited.
 *
 *  Coordinates are typed, not dragged. See SiteMap for why the map is
 *  confirm-only.
 */

const SITE_TYPES = ['PLANT', 'BRANCH', 'STATION', 'YARD'] as const;
type SiteType = (typeof SITE_TYPES)[number];

interface Site {
  id: string;
  siteCode: string;
  siteName: string;
  siteType: SiteType;
  addressLine: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusMetres: number;
  isPrimary: boolean;
  isActive: boolean;
}

interface SitesResponse {
  sites: Site[];
  hasPrimary: boolean;
  canWrite: boolean;
  /** Whether this role may see the fleet on the map (FLEET_POSITION_READ). */
  canReadFleetPositions: boolean;
}

type Tab = 'register' | 'map' | 'fleet' | 'registry';

const inputCls =
  'bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500';

export default function Sites() {
  const { currentUser } = useAuth();
  const t = useSitesDict();

  const [tab, setTab] = useState<Tab>('register');
  const [data, setData] = useState<SitesResponse>({
    sites: [],
    hasPrimary: false,
    canWrite: false,
    canReadFleetPositions: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  // add form
  const [siteCode, setSiteCode] = useState('');
  const [siteName, setSiteName] = useState('');
  const [siteType, setSiteType] = useState<SiteType>('BRANCH');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('200');
  const [isPrimary, setIsPrimary] = useState(false);
  const [locating, setLocating] = useState(false);

  // inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLat, setEditLat] = useState('');
  const [editLng, setEditLng] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<SitesResponse>('/api/sites');
      setData({
        sites: res?.sites ?? [],
        hasPrimary: !!res?.hasPrimary,
        canWrite: !!res?.canWrite,
        canReadFleetPositions: !!res?.canReadFleetPositions,
      });
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
  }, [load]);

  const visible = useMemo(
    () => (showRetired ? data.sites : data.sites.filter((s) => s.isActive)),
    [data.sites, showRetired]
  );

  const canWrite = data.canWrite;

  const typeLabel = (v: SiteType): string => {
    switch (v) {
      case 'PLANT': return t('typePlant');
      case 'BRANCH': return t('typeBranch');
      case 'STATION': return t('typeStation');
      case 'YARD': return t('typeYard');
      default: return v;
    }
  };

  /** Fill the coordinates from the phone/desktop GPS instead of typing them. */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError(t('locationDenied'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError(t('locationDenied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };

  const resetForm = () => {
    setSiteCode('');
    setSiteName('');
    setSiteType('BRANCH');
    setCity('');
    setAddress('');
    setLatitude('');
    setLongitude('');
    setRadius('200');
    setIsPrimary(false);
  };

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await api.post('/api/sites', {
        siteCode: siteCode.trim(),
        siteName: siteName.trim(),
        siteType,
        addressLine: address.trim() || null,
        city: city.trim() || null,
        // Sent as numbers, not strings: the API validates with z.number(), so a
        // string here would be rejected as a type error rather than as a
        // coordinate problem, and the message would be useless.
        latitude: Number(latitude),
        longitude: Number(longitude),
        geofenceRadiusMetres: Number(radius) || 200,
        isPrimary,
      });
      resetForm();
      await load();
      setTab('registry');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const patchSite = async (id: string, body: Record<string, unknown>) => {
    setError('');
    try {
      await api.patch(`/api/sites/${id}`, body);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      return false;
    }
  };

  const startEdit = (s: Site) => {
    setEditingId(s.id);
    setEditLat(String(s.latitude));
    setEditLng(String(s.longitude));
  };

  const saveEdit = async (id: string) => {
    const done = await patchSite(id, { latitude: Number(editLat), longitude: Number(editLng) });
    if (done) setEditingId(null);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{t('accessDenied')}</p>
          <Link to="/login" className="text-sky-400 underline">{t('backToLogin')}</Link>
        </div>
      </div>
    );
  }

  // The fleet tab is hidden entirely for roles without FLEET_POSITION_READ rather
  // than rendered read-only: a driver has no reason to know the tab exists, and a
  // disabled tab still advertises a feature he cannot use.
  const tabs: { id: Tab; label: string }[] = [
    { id: 'register', label: t('tabRegister') },
    { id: 'map', label: t('tabMap') },
    ...(data.canReadFleetPositions
      ? [{ id: 'fleet' as const, label: t('tabFleet') }]
      : []),
    { id: 'registry', label: t('tabRegistry') },
  ];

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} />
          <Link to="/" className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white">
            {t('backToDashboard')}
          </Link>
          <QuickJump /> <LangSelector />
          <div>
            <h1 className="text-sm font-bold text-white">{t('pageTitle')}</h1>
            <p className="text-[11px] text-slate-400">{t('subtitle')}</p>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex gap-2 border-b border-white/10">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`px-4 py-2 text-xs font-bold rounded-t-lg border border-b-0 transition ${
                tab === tb.id
                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                  : 'bg-white/[0.02] text-slate-400 border-white/10 hover:text-white'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs rounded-lg px-4 py-2.5">
            {error}
          </div>
        )}

        {!loading && data.sites.length > 0 && !data.hasPrimary && (
          <div className="bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs rounded-lg px-4 py-2.5">
            {t('noPrimaryWarning')}
          </div>
        )}

        {!loading && !canWrite && data.sites.length > 0 && (
          <div className="bg-white/[0.03] border border-white/10 text-slate-400 text-xs rounded-lg px-4 py-2.5">
            {t('readOnlyNote')}
          </div>
        )}

        {/* ── ADD ───────────────────────────────────────────────────────── */}
        {tab === 'register' && (
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-white">{t('formTitle')}</h2>
            <p className="text-[11px] text-slate-400">{t('formHint')}</p>

            {canWrite ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className={inputCls} value={siteCode} onChange={(e) => setSiteCode(e.target.value)} placeholder={t('siteCodePh')} dir="ltr" />
                <input className={inputCls} value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder={t('siteNamePh')} />
                <select className={inputCls} value={siteType} onChange={(e) => setSiteType(e.target.value as SiteType)}>
                  {SITE_TYPES.map((ty) => (
                    <option key={ty} value={ty}>{typeLabel(ty)}</option>
                  ))}
                </select>
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('city')} />
                <input className={`${inputCls} sm:col-span-2`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('address')} />

                <input className={inputCls} value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder={t('latitude')} dir="ltr" inputMode="decimal" />
                <input className={inputCls} value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder={t('longitude')} dir="ltr" inputMode="decimal" />

                <div className="sm:col-span-2">
                  <button
                    onClick={useMyLocation}
                    disabled={locating}
                    className="text-[11px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/30 px-3 py-2 rounded-lg hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    {locating ? t('locating') : t('myLocation')}
                  </button>
                </div>

                <div>
                  <input className={inputCls} value={radius} onChange={(e) => setRadius(e.target.value)} placeholder={t('radius')} dir="ltr" inputMode="numeric" />
                  <p className="text-[10px] text-slate-500 mt-1">{t('radiusHint')}</p>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
                  {t('isPrimary')}
                </label>

                <div className="sm:col-span-2">
                  <button
                    onClick={submit}
                    disabled={busy || !siteCode.trim() || !siteName.trim()}
                    className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white text-xs font-bold px-4 py-2.5 rounded-lg disabled:opacity-40"
                  >
                    {busy ? t('submitting') : t('submit')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">{t('readOnlyNote')}</p>
            )}
          </section>
        )}

        {/* ── MAP ───────────────────────────────────────────────────────── */}
        {tab === 'map' && (
          <section className="space-y-2">
            <h2 className="text-sm font-bold text-white">{t('mapTitle')}</h2>
            {visible.length === 0 ? (
              <p className="text-xs text-slate-400">{t('mapEmpty')}</p>
            ) : (
              <>
                <SiteMap sites={visible} className="h-[420px] w-full rounded-xl border border-white/10 overflow-hidden" />
                <p className="text-[10px] text-slate-500">{t('mapTilesNote')}</p>
              </>
            )}
          </section>
        )}

        {/* Guarded twice: the tab button is hidden, and the panel is not rendered even
            if `tab` somehow still equals 'fleet' — which can happen after a
            refresh drops the grant mid-session, leaving no selected tab button.
            Without this the panel would render for a role that just lost access. */}
        {tab === 'fleet' && data.canReadFleetPositions && (
          <FleetPositions sites={visible} />
        )}

        {/* ── REGISTER ──────────────────────────────────────────────────── */}
        {tab === 'registry' && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">{t('tabRegistry')}</h2>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
                {t('showRetired')}
              </label>
            </div>

            {loading ? (
              <p className="text-xs text-slate-400">{t('loadFailed')}…</p>
            ) : visible.length === 0 ? (
              <p className="text-xs text-slate-400">{t('emptyRegistry')}</p>
            ) : (
              <div className="space-y-2">
                {visible.map((s) => (
                  <div key={s.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">{s.siteName}</span>
                        <span className="text-[10px] text-slate-400 border border-white/10 rounded px-1.5 py-0.5" dir="ltr">{s.siteCode}</span>
                        <span className="text-[10px] text-slate-400">{typeLabel(s.siteType)}</span>
                        {s.isPrimary && (
                          <span className="text-[10px] font-bold text-orange-300 bg-orange-500/10 border border-orange-500/30 rounded px-1.5 py-0.5">
                            {t('primaryBadge')}
                          </span>
                        )}
                        {!s.isActive && (
                          <span className="text-[10px] font-bold text-slate-400 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                            {t('retiredBadge')}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1.5" dir="ltr">
                      {s.latitude.toFixed(6)}, {s.longitude.toFixed(6)}
                      <span className="text-slate-500"> · {s.geofenceRadiusMetres} m</span>
                      {s.city ? <span> · {s.city}</span> : null}
                    </p>

                    {editingId === s.id ? (
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <input className={`${inputCls} !py-1 !text-xs w-40`} value={editLat} onChange={(e) => setEditLat(e.target.value)} dir="ltr" />
                        <input className={`${inputCls} !py-1 !text-xs w-40`} value={editLng} onChange={(e) => setEditLng(e.target.value)} dir="ltr" />
                        <button onClick={() => saveEdit(s.id)} className="text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
                          {t('saveChanges')}
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-[11px] text-slate-400 underline">
                          ✕
                        </button>
                      </div>
                    ) : canWrite ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {!s.isPrimary && s.isActive && (
                          <button onClick={() => patchSite(s.id, { makePrimary: true })} className="text-[11px] font-bold text-orange-300 bg-orange-500/10 border border-orange-500/30 px-3 py-1.5 rounded-lg">
                            {t('makePrimary')}
                          </button>
                        )}
                        <button onClick={() => startEdit(s)} className="text-[11px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/30 px-3 py-1.5 rounded-lg">
                          {t('editLocation')}
                        </button>
                        {s.isActive && (
                          <button onClick={() => patchSite(s.id, { deactivate: true })} className="text-[11px] font-bold text-red-300 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-lg">
                            {t('retire')}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}