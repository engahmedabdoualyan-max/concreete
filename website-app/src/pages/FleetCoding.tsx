import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useFleetCodingDict } from '../i18n/fleetCodingDict';
import BrandLogo from '../components/BrandLogo';
import LangSelector from '../components/LangSelector';

/**
 * ============================================================
 *  Fleet & Device Coding — /fleet/coding
 * ============================================================
 *  "ربط وتكويد المركبات": attaching a tracker or probe to a mixer.
 *
 *  This is a new page that talks to /api/fleet and /api/fleet/devices. It
 *  deliberately does not touch the Dashboard or the Firestore-backed Assets &
 *  Fleet panel — see the note in the repository README on which registry is
 *  authoritative. Postgres `fleet_vehicles` + `telematics_devices` is the one the
 *  API serves, and the trips already reference it.
 *
 *  Why this page exists at all, rather than a column in the existing asset list:
 *  a device identity has rules the asset table cannot express — an IMEI is coded
 *  exactly once in the whole system, a truck has one primary device per type, and
 *  a device moved between trucks keeps its history. Those need their own screen
 *  where the conflicts can actually be explained to the workshop.
 */

const DEVICE_TYPES = [
  'DRUM_RPM',
  'CONCRETE_TEMP',
  'WATER_ADD_METER',
  'GPS_TRACKER',
] as const;
type DeviceType = (typeof DEVICE_TYPES)[number];

interface Vehicle {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: string;
  isActive?: boolean;
}

interface CodedDevice {
  id: string;
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  deviceType: string;
  deviceCode: string | null;
  serialNumber: string | null;
  isPrimary: boolean;
  isActive: boolean;
  linkedAt: string | null;
  lastSeenAt: string | null;
}

type Tab = 'register' | 'registry' | 'lookup' | 'trips';

function when(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function FleetCoding() {
  const { currentUser } = useAuth();
  const t = useFleetCodingDict();

  const [tab, setTab] = useState<Tab>('register');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [devices, setDevices] = useState<CodedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // register form
  const [vehicleId, setVehicleId] = useState('');
  const [deviceType, setDeviceType] = useState<DeviceType>('GPS_TRACKER');
  const [deviceCode, setDeviceCode] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);

  // registry
  const [showUncoded, setShowUncoded] = useState(false);

  // lookup
  const [lookupSerial, setLookupSerial] = useState('');
  const [lookupResult, setLookupResult] = useState<CodedDevice | null>(null);
  const [lookupError, setLookupError] = useState('');
  const [tripDate, setTripDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [tripRows, setTripRows] = useState<any[]>([]);
  const [tripTotal, setTripTotal] = useState(0);
  const [tripBusy, setTripBusy] = useState(false);
  const [tripMsg, setTripMsg] = useState('');

  const loadTrips = async () => {
    setTripBusy(true);
    setTripMsg('');
    try {
      const d = await api.get<{ vehicles?: any[]; totalTrips?: number }>(
        `/api/fleet/trip-report?date=${tripDate}`
      );
      setTripRows(Array.isArray(d?.vehicles) ? d.vehicles.filter((v) => v.tripsCount > 0) : []);
      setTripTotal(d?.totalTrips ?? 0);
    } catch (e) {
      setTripMsg(e instanceof ApiError ? e.message : String(e));
      setTripRows([]);
    } finally {
      setTripBusy(false);
    }
  };

  // move-to dialog
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, d] = await Promise.all([
        api.get<Vehicle[]>('/api/fleet'),
        api.get<CodedDevice[]>(
          `/api/fleet/devices?includeInactive=${showUncoded ? 'true' : 'false'}`
        ),
      ]);
      setVehicles(v ?? []);
      setDevices(d ?? []);
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [showUncoded]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    load();
  }, [load]);

  /** Vehicles a device could move to: active, and not the one it is on now. */
  const moveTargets = useMemo(() => {
    const current = devices.find((d) => d.id === movingId);
    return vehicles.filter(
      (v) => v.isActive !== false && v.id !== current?.vehicleId
    );
  }, [vehicles, devices, movingId]);

  const typeLabel = (t2: string): string => {
    switch (t2) {
      case 'DRUM_RPM':
        return t('typeDrumRpm');
      case 'CONCRETE_TEMP':
        return t('typeTemp');
      case 'WATER_ADD_METER':
        return t('typeWater');
      case 'GPS_TRACKER':
        return t('typeGps');
      default:
        return t2;
    }
  };

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await api.post('/api/fleet/devices', {
        vehicleId,
        deviceType,
        // Trimmed to undefined, not '' — an empty string is not "no value",
        // and the API rejects an identity-less device on purpose.
        serialNumber: serialNumber.trim() || undefined,
        deviceCode: deviceCode.trim() || undefined,
        isPrimary,
      });
      setDeviceCode('');
      setSerialNumber('');
      setIsPrimary(false);
      await load();
      setTab('registry');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doLookup = async () => {
    setLookupError('');
    setLookupResult(null);
    const serial = lookupSerial.trim();
    if (!serial) return;
    try {
      const found = await api.get<CodedDevice>(
        `/api/fleet/devices?serial=${encodeURIComponent(serial)}`
      );
      setLookupResult(found);
    } catch (e) {
      setLookupError(
        e instanceof ApiError ? e.message : t('notCoded')
      );
    }
  };

  const doMove = async (deviceId: string) => {
    setError('');
    try {
      await api.patch(`/api/fleet/devices/${deviceId}`, {
        vehicleId: moveTarget,
      });
      setMovingId(null);
      setMoveTarget('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const doUncode = async (device: CodedDevice) => {
    // A destructive action, so it is confirmed rather than assumed. Deleting the
    // row would also work, but the API keeps the history on purpose.
    const label = device.deviceCode || device.serialNumber || device.id;
    if (!window.confirm(`${t('confirmUncode')}\n\n${label}`)) return;
    setError('');
    try {
      await api.del(`/api/fleet/devices/${device.id}`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0B111E] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{t('accessDenied')}</p>
          <Link to="/login" className="text-sky-400 underline">
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full bg-white/[0.04] border border-white/10 rounded-lg p-2 text-white text-xs';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'register', label: t('tabRegister') },
    { id: 'registry', label: t('tabRegistry') },
    { id: 'lookup', label: t('tabLookup') },
    { id: 'trips', label: t('tabTrips') },
  ];

  return (
    <div className="min-h-screen bg-[#0B111E] text-slate-200">
      <div className="bg-[#0B111E]/80 backdrop-blur-xl border-b border-white/10 px-6 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <BrandLogo width={56} />
          <Link
            to="/"
            className="text-slate-400 text-xs border border-white/10 px-2 py-1 rounded hover:text-white"
          >
            {t('backToDashboard')}
          </Link>
          <LangSelector />
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
          <div className="bg-red-500/10 border border-red-500/40 px-4 py-3 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ── register ───────────────────────────────────────────────── */}
        {tab === 'register' && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-4">
            <h3 className="text-lg font-bold text-white">{t('formTitle')}</h3>

            <div className="grid md:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-300">{t('vehicle')}</span>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className={`${inputCls} mt-1`}
                >
                  <option value="">{t('selectVehicle')}</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id} className="bg-[#0B111E]">
                      {v.vehicleCode} — {v.plateNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-300">{t('deviceType')}</span>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as DeviceType)}
                  className={`${inputCls} mt-1`}
                >
                  {DEVICE_TYPES.map((dt) => (
                    <option key={dt} value={dt} className="bg-[#0B111E]">
                      {typeLabel(dt)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-300">{t('deviceCode')}</span>
                <input
                  value={deviceCode}
                  onChange={(e) => setDeviceCode(e.target.value)}
                  placeholder="DRUM-01"
                  className={`${inputCls} mt-1`}
                />
                <span className="text-[11px] text-slate-500">{t('deviceCodeHint')}</span>
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-300">{t('serialNumber')}</span>
                <input
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="867994045123456"
                  inputMode="numeric"
                  className={`${inputCls} mt-1`}
                />
                <span className="text-[11px] text-slate-500">{t('serialHint')}</span>
              </label>
            </div>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={(e) => setIsPrimary(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-slate-300">
                <b>{t('isPrimary')}</b>
                <br />
                <span className="text-[11px] text-slate-500">{t('isPrimaryHint')}</span>
              </span>
            </label>

            <button
              onClick={submit}
              disabled={busy || !vehicleId}
              className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white font-bold px-6 py-2 rounded-lg text-sm"
            >
              {busy ? t('submitting') : t('submit')}
            </button>
          </div>
        )}

        {/* ── registry ───────────────────────────────────────────────── */}
        {tab === 'registry' && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="text-lg font-bold text-white">{t('registryTitle')}</h3>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={showUncoded}
                  onChange={(e) => setShowUncoded(e.target.checked)}
                />
                {t('showUncoded')}
              </label>
            </div>

            {loading ? (
              <p className="text-xs text-slate-400">{t('reloading')}</p>
            ) : devices.length === 0 ? (
              <p className="text-xs text-slate-400">{t('noDevices')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-white/10">
                      <th className="py-2 pr-3">{t('colVehicle')}</th>
                      <th className="py-2 pr-3">{t('colPlate')}</th>
                      <th className="py-2 pr-3">{t('colType')}</th>
                      <th className="py-2 pr-3">{t('colCode')}</th>
                      <th className="py-2 pr-3">{t('colSerial')}</th>
                      <th className="py-2 pr-3">{t('colLastSeen')}</th>
                      <th className="py-2 pr-3">{t('colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => (
                      <tr
                        key={d.id}
                        className={`border-b border-white/5 ${d.isActive ? '' : 'opacity-50'}`}
                      >
                        <td className="py-2 pr-3 font-bold text-white">{d.vehicleCode}</td>
                        <td className="py-2 pr-3">{d.plateNumber}</td>
                        <td className="py-2 pr-3">
                          {typeLabel(d.deviceType)}
                          {d.isPrimary && (
                            <span className="ml-1 text-amber-400">{t('primary')}</span>
                          )}
                          {!d.isActive && (
                            <span className="ml-1 text-slate-400">({t('inactive')})</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{d.deviceCode || '—'}</td>
                        <td className="py-2 pr-3 font-mono">{d.serialNumber || '—'}</td>
                        <td className="py-2 pr-3 text-slate-400">
                          {d.lastSeenAt ? when(d.lastSeenAt) : t('never')}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex gap-2">
                            {d.isActive ? (
                              <>
                                {movingId === d.id ? (
                                  <>
                                    <select
                                      value={moveTarget}
                                      onChange={(e) => setMoveTarget(e.target.value)}
                                      className="bg-[#0B111E] border border-white/10 rounded px-1 py-0.5 text-[11px] max-w-[130px]"
                                    >
                                      <option value="">{t('moveTo')}</option>
                                      {moveTargets.map((v) => (
                                        <option key={v.id} value={v.id}>
                                          {v.vehicleCode}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => moveTarget && doMove(d.id)}
                                      disabled={!moveTarget}
                                      className="bg-emerald-500/80 hover:bg-emerald-500 disabled:opacity-40 text-white px-2 py-0.5 rounded text-[11px]"
                                    >
                                      ✓
                                    </button>
                                    <button
                                      onClick={() => {
                                        setMovingId(null);
                                        setMoveTarget('');
                                      }}
                                      className="bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded text-[11px]"
                                    >
                                      ✕
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setMovingId(d.id);
                                      setMoveTarget('');
                                    }}
                                    className="bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded text-[11px]"
                                  >
                                    {t('moveTo')}
                                  </button>
                                )}
                                <button
                                  onClick={() => doUncode(d)}
                                  className="bg-red-500/20 hover:bg-red-500/40 text-red-300 px-2 py-0.5 rounded text-[11px]"
                                >
                                  {t('uncode')}
                                </button>
                              </>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── lookup ─────────────────────────────────────────────────── */}
        {tab === 'lookup' && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-4">
            <h3 className="text-lg font-bold text-white">{t('lookupTitle')}</h3>
            <p className="text-xs text-slate-400">{t('lookupHint')}</p>
            <div className="flex gap-3 flex-wrap">
              <input
                value={lookupSerial}
                onChange={(e) => setLookupSerial(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doLookup()}
                placeholder="867994045123456"
                inputMode="numeric"
                className={`${inputCls} max-w-[280px]`}
              />
              <button
                onClick={doLookup}
                disabled={!lookupSerial.trim()}
                className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white font-bold px-6 py-2 rounded-lg text-sm"
              >
                {t('lookup')}
              </button>
            </div>

            {lookupError && (
              <p className="text-sm text-amber-400">{lookupError}</p>
            )}

            {lookupResult && (
              <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 text-xs space-y-1">
                <p className="text-base font-bold text-white">
                  {lookupResult.vehicleCode} — {lookupResult.plateNumber}
                </p>
                <p>{typeLabel(lookupResult.deviceType)}</p>
                <p className="text-slate-400">
                  {t('colCode')}: {lookupResult.deviceCode || '—'} · {t('colSerial')}:{' '}
                  <span className="font-mono">{lookupResult.serialNumber}</span>
                </p>
                <p className="text-slate-400">
                  {t('colLastSeen')}:{' '}
                  {lookupResult.lastSeenAt ? when(lookupResult.lastSeenAt) : t('never')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── trips ──────────────────────────────────────────────────── */}
        {tab === 'trips' && (
          <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-6 backdrop-blur-xl space-y-4">
            <h3 className="text-lg font-bold text-white">{t('tripsTitle')}</h3>
            <p className="text-xs text-slate-400">{t('tripsHint')}</p>
            <div className="flex gap-3 flex-wrap items-center">
              <input
                type="date"
                value={tripDate}
                onChange={(e) => setTripDate(e.target.value)}
                className={`${inputCls} max-w-[200px]`}
              />
              <button
                onClick={loadTrips}
                disabled={tripBusy || !tripDate}
                className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white font-bold px-6 py-2 rounded-lg text-sm"
              >
                {tripBusy ? '…' : `${t('tripsLoad')} (${tripTotal} ${t('tripsTotal')})`}
              </button>
            </div>
            {tripMsg && <p className="text-sm text-amber-400">{tripMsg}</p>}
            {tripRows.length === 0 && !tripBusy && !tripMsg && (
              <p className="text-xs text-slate-500">{t('tripsNone')}</p>
            )}
            <div className="space-y-2">
              {tripRows.map((v) => (
                <div key={v.vehicleId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="font-black text-white">🚛 {v.vehicleCode} · {v.plateNumber}</span>
                    <span className="text-slate-300">
                      {v.tripsCount} {t('tripsTotal')} · {v.minutesOut} {t('tripsMinOut')}
                      {v.openTrips > 0 && <span className="text-amber-300 font-black"> · 🟡 {t('tripsOpen')}</span>}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {v.trips.map((tr: any, i: number) => (
                      <p key={i} className="text-slate-400" dir="ltr">
                        {when(tr.startedAt)} → {tr.endedAt ? when(tr.endedAt) : '…'}
                        {tr.durationMinutes != null && ` · ${tr.durationMinutes} min`}
                        {` · ${(tr.maxDistanceMetres / 1000).toFixed(1)} km`}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
