import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useSitesDict } from '../i18n/sitesDict';
import { useLang } from '../context/LangContext';
import SiteMap, { type MapSite, type MapVehicle } from './SiteMap';

/**
 * ============================================================
 *  FleetPositions — 🚛 vehicles measured against the sites
 * ============================================================
 *  This is the payoff of recording where the plant is. A tracker gives you a dot
 *  on a map; a *site* gives that dot a meaning: which yard it is nearest, how far
 *  it is from the plant, and whether it is actually on site.
 *
 * ── Distances are shown even when the fix is stale ────────────────────────────
 *  A tracker that died an hour ago still has a last-known position. Dropping it
 *  would make a truck parked at the gate look like a truck with no data at all —
 *  and "no data" is the thing dispatch actually needs to chase. So the row is
 *  shown, greyed, with the age spelled out. It is a known-stale position, not a
 *  live one, and the two must not look alike.
 *
 * ── Refresh is manual, not polled ─────────────────────────────────────────────
 *  No `setInterval`. A 28-truck fleet polled every 15 s is 112 requests a minute
 *  from every open tab, forever, to redraw dots that have not moved. The button is
 *  there when someone actually wants to know.
 */

interface NearestSite {
  siteCode: string;
  siteName: string;
  distanceMetres: number;
  isInsideGeofence: boolean;
}

interface Position {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: string;
  currentStatus: string;
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  source: string;
  capturedAt: string;
  ageMinutes: number;
  isStale: boolean;
  nearestSite: NearestSite | null;
  distanceToPrimaryMetres: number | null;
  bearingToPrimaryDegrees: number | null;
  isInsidePrimaryGeofence: boolean;
}

interface PositionsResponse {
  positions: Position[];
  siteCount: number;
  hasPrimarySite: boolean;
  vehiclesWithoutFix: number;
}

interface Props {
  sites: MapSite[];
}

/**
 * Metres → something a human reads at a glance.
 *
 * The 1000 m crossover is not arbitrary: below it, "412 m" is more useful than
 * "0.41 km", and above it the reverse. Rounding to 0 dp under 100 m is deliberate
 * too — at the gate, ten metres of false precision matters (the geofence is 200 m),
 * whereas a digit on a number that is already 800 km is decoration.
 */
function fmtDistance(metres: number | null): string {
  if (metres === null) return '—';
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  if (metres < 100_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

function fmtAge(minutes: number, t: (k: string) => string): string {
  if (minutes < 1) return t('ageNow');
  if (minutes < 60) return t('ageMinutes').replace('{n}', String(minutes));
  const h = Math.round(minutes / 60);
  if (h < 24) return t('ageHours').replace('{n}', String(h));
  return t('ageDays').replace('{n}', String(Math.round(h / 24)));
}

export default function FleetPositions({ sites }: Props) {
  const t = useSitesDict();
  const { lang } = useLang();
  const [data, setData] = useState<PositionsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [onlyOnSite, setOnlyOnSite] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<PositionsResponse>('/api/fleet/positions');
      setData(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const positions = data?.positions ?? [];

  const shown = useMemo(
    () => (onlyOnSite ? positions.filter((p) => p.isInsidePrimaryGeofence) : positions),
    [positions, onlyOnSite]
  );

  // Sorted so the trucks that are actually at a site are at the top, then by
  // distance. "Where is everything right now" is a ranking question.
  const sorted = useMemo(
    () =>
      [...shown].sort((a, b) => {
        if (a.isInsidePrimaryGeofence !== b.isInsidePrimaryGeofence)
          return a.isInsidePrimaryGeofence ? -1 : 1;
        return (a.distanceToPrimaryMetres ?? Infinity) - (b.distanceToPrimaryMetres ?? Infinity);
      }),
    [shown]
  );

  const onSiteCount = positions.filter((p) => p.isInsidePrimaryGeofence).length;

  const mapVehicles: MapVehicle[] = useMemo(
    () =>
      sorted.map((p) => ({
        vehicleId: p.vehicleId,
        vehicleCode: p.vehicleCode,
        plateNumber: p.plateNumber,
        latitude: p.latitude,
        longitude: p.longitude,
        isStale: p.isStale,
        isInsidePrimaryGeofence: p.isInsidePrimaryGeofence,
        nearestLine: p.nearestSite
          ? `${p.nearestSite.siteName} (${p.nearestSite.siteCode})`
          : t('noSitesYet'),
        distanceLine: `${t('fromPlant')} ${fmtDistance(p.distanceToPrimaryMetres)}`,
        ageLine: fmtAge(p.ageMinutes, t),
      })),
    // `lang`, not `t`: usePageDict builds a fresh closure on every render, so
    // depending on it would rebuild the array — and therefore redraw every marker
    // on the map — on every unrelated state change in this component.
    [sorted, lang]
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">{t('fleetTitle')}</h2>
          <p className="text-[11px] text-slate-400">{t('fleetSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={onlyOnSite}
              onChange={(e) => setOnlyOnSite(e.target.checked)}
            />
            {t('onlyOnSite')}
          </label>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="text-[11px] font-bold text-sky-300 bg-sky-500/10 border border-sky-500/30 px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {loading ? t('refreshing') : t('refresh')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-300 text-xs rounded-lg px-4 py-2.5">
          {error}
        </div>
      )}

      {data && !data.hasPrimarySite && (
        <div className="bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs rounded-lg px-4 py-2.5">
          {t('fleetNoPrimary')}
        </div>
      )}

      {/* The counts are the point of the panel. "0 trucks reporting" and "0 trucks
          on site" are completely different operational facts and a bare list
          conflates them. */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label={t('statReporting')} value={String(positions.length)} tone="sky" />
          <Stat label={t('statOnSite')} value={String(onSiteCount)} tone="emerald" />
          <Stat
            label={t('statNoFix')}
            value={String(data.vehiclesWithoutFix)}
            tone={data.vehiclesWithoutFix > 0 ? 'amber' : 'slate'}
          />
          <Stat label={t('statSites')} value={String(data.siteCount)} tone="slate" />
        </div>
      )}

      {positions.length > 0 && (
        <>
          <SiteMap
            sites={sites}
            vehicles={mapVehicles}
            className="h-[420px] w-full rounded-xl border border-white/10 overflow-hidden"
          />
          <p className="text-[10px] text-slate-500">{t('mapTilesNote')}</p>
        </>
      )}

      {loading && positions.length === 0 && (
        <p className="text-xs text-slate-400">{t('loadingFleet')}…</p>
      )}

      {!loading && positions.length === 0 && !error && (
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4 space-y-1.5">
          <p className="text-xs text-slate-300">{t('fleetNoFixes')}</p>
          <p className="text-[11px] text-slate-500">{t('fleetNoFixesHint')}</p>
        </div>
      )}

      {sorted.length > 0 && (
        <div className="space-y-1.5">
          {sorted.map((p) => (
            <div
              key={p.vehicleId}
              className={`bg-white/[0.03] border rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 ${
                p.isInsidePrimaryGeofence ? 'border-emerald-500/40' : 'border-white/10'
              } ${p.isStale ? 'opacity-70' : ''}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white" dir="ltr">
                  {p.vehicleCode}
                </span>
                {p.plateNumber && (
                  <span className="text-[10px] text-slate-400 border border-white/10 rounded px-1.5 py-0.5" dir="ltr">
                    {p.plateNumber}
                  </span>
                )}
                {p.isInsidePrimaryGeofence && (
                  <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-1.5 py-0.5">
                    {t('onSiteBadge')}
                  </span>
                )}
                {p.isStale && (
                  <span className="text-[10px] font-bold text-slate-300 bg-white/5 border border-white/20 rounded px-1.5 py-0.5">
                    {t('staleBadge')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-slate-300">
                  {t('fromPlant')}{' '}
                  <b className="text-white" dir="ltr">
                    {fmtDistance(p.distanceToPrimaryMetres)}
                  </b>
                </span>
                {p.nearestSite && (
                  <span className="text-slate-400">
                    {t('nearest')}{' '}
                    <b className="text-slate-200" dir="ltr">
                      {p.nearestSite.siteCode} · {fmtDistance(p.nearestSite.distanceMetres)}
                    </b>
                  </span>
                )}
                <span className="text-slate-500">{fmtAge(p.ageMinutes, t)}</span>
                {p.speedKmh !== null && (
                  <span className="text-slate-500" dir="ltr">
                    {Math.round(p.speedKmh)} km/h
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'sky' | 'emerald' | 'amber' | 'slate';
}) {
  const tones = {
    sky: 'text-sky-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    slate: 'text-slate-300',
  };
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={`text-xl font-bold ${tones[tone]}`} dir="ltr">
        {value}
      </p>
    </div>
  );
}