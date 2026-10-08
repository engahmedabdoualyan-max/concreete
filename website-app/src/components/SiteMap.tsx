import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * SiteMap — the plant and its branches, drawn on a map.
 *
 * ── Why display-only ──────────────────────────────────────────────────────────
 * The map shows; the numbers in the form are the input. That split is deliberate:
 * dragging a marker is the easy way to place a point and the *wrong* way to enter
 * one, because a dragged marker silently snaps to whatever tile feature is under
 * the cursor, and nobody notices the 40 m error until a truck "arrives" early.
 * So the form takes lat/lng (or the phone's own fix) and this map confirms the
 * result.
 *
 * ── The default-marker problem ────────────────────────────────────────────────
 * Leaflet's default marker is a PNG referenced by relative URL from inside the
 * package, which bundlers routinely fail to resolve — the classic symptom is a
 * map that renders fine with an invisible/broken pin. Rather than fight the
 * bundler, the marker is a divIcon built from CSS here: no image, no asset path.
 *
 * ── No geofence circles ──────────────────────────────────────────────────────
 * The radius is deliberately NOT drawn. A circle scaled by zoom looks authoritative
 * while being off by a large factor at other zooms, and it invites "is the truck
 * inside it?" arguments that the exact haversine distance answers properly. The
 * number is in the table; the answer belongs in code.
 */

export interface MapSite {
  id: string;
  siteCode: string;
  siteName: string;
  latitude: number;
  longitude: number;
  isPrimary: boolean;
  siteType: string;
}

/**
 * A vehicle, reduced to what the map needs. The distance fields are pre-formatted
 * strings rather than numbers because the same marker is rendered in an RTL
 * layout and an LTR one, and "821.7 km" and "821.7 كم" are the same measurement.
 * Formatting once here keeps that decision out of the marker HTML.
 */
export interface MapVehicle {
  vehicleId: string;
  vehicleCode: string;
  plateNumber: string;
  latitude: number;
  longitude: number;
  isStale: boolean;
  isInsidePrimaryGeofence: boolean;
  /** e.g. "HQ · 240 m" */
  nearestLine: string;
  /** e.g. "821.7 km" or "412 m" */
  distanceLine: string;
  /** e.g. "3 min ago" */
  ageLine: string;
  /** Optional extra line, e.g. "الحالة: متاح · 45 كم/س". Rendered only if set. */
  statusLine?: string;
  /** Optional deep-link shown in the popup, e.g. "#/operations". */
  detailHref?: string;
  /** Label for the deep-link. Defaults to "⇢". */
  detailLabel?: string;
  /** ISO instant of the last fix, e.g. for the cluster detail card. */
  capturedAt?: string;
}

interface Props {
  sites: MapSite[];
  /**
   * Optional. Passing them here rather than mounting a second map is deliberate:
   * one map means the plant and the trucks are visibly in the same coordinate
   * space, which is the entire point of recording the plant at all. Two maps
   * side by side would each need their own pan/zoom and would quietly disagree.
   */
  vehicles?: MapVehicle[];
  className?: string;
}

const TYPE_COLOR: Record<string, string> = {
  PLANT: '#38bdf8',
  BRANCH: '#34d399',
  STATION: '#fbbf24',
  YARD: '#a78bfa',
};

/** Primary pin: larger, ringed, and labelled — it is the origin for everything. */
function pinIcon(site: MapSite): L.DivIcon {
  const color = site.isPrimary ? '#f97316' : TYPE_COLOR[site.siteType] ?? '#94a3b8';
  const size = site.isPrimary ? 26 : 18;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      background:${color};
      border:${site.isPrimary ? '3px solid #fff' : '2px solid rgba(255,255,255,.85)'};
      box-shadow:0 0 0 4px ${color}33, 0 2px 6px rgba(0,0,0,.6);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Vehicle marker.
 *
 * Three states, and the third is the one that matters:
 *   • inside the plant geofence → green ring, i.e. "on site"
 *   • fresh fix outside        → solid blue
 *   • stale fix                 → hollow grey
 *
 * The stale marker is deliberately still drawn at full position opacity rather than
 * dropped. Hiding it would make a dead tracker look like an un-tracked vehicle,
 * which is a different problem with a different fix; greying it says "we know
 * where it was, and we know that was a while ago".
 */
function vehicleIcon(v: MapVehicle): L.DivIcon {
  const inside = v.isInsidePrimaryGeofence && !v.isStale;
  const color = inside ? '#34d399' : v.isStale ? '#64748b' : '#60a5fa';
  const size = 14;
  const code = escapeHtml(v.vehicleCode || '');
  // Permanent code label above the dot so the TV screen reads without clicks.
  // Overlapping labels at the depot separate as soon as you zoom in.
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:72px;height:36px;">` +
      `<div style="position:absolute;top:0;left:50%;transform:translateX(-50%);white-space:nowrap;` +
      `background:rgba(2,6,16,.88);color:#fff;font-size:10px;font-weight:800;line-height:1.5;` +
      `padding:0 7px;border-radius:9999px;border:1px solid ${color};">${code}</div>` +
      `<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);` +
      `width:${size}px;height:${size}px;border-radius:${inside ? '9999px' : '3px'};` +
      `background:${v.isStale ? 'transparent' : color};` +
      `border:2px solid ${color};` +
      `${inside ? `box-shadow:0 0 0 4px ${color}40;` : ''}"></div></div>`,
    iconSize: [72, 36],
    iconAnchor: [36, 36],
  });
}

export default function SiteMap({ sites, vehicles = [], className = '' }: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);
  // Cluster picked by tapping a stacked dot: list its vehicles, then drill
  // into one for its last fix. Lives in React (not a Leaflet popup) so the
  // list is tappable/scrollable on the TV screen.
  const [picked, setPicked] = useState<MapVehicle[] | null>(null);
  const [focused, setFocused] = useState<MapVehicle | null>(null);

  // Create the map once. Leaflet throws if you initialise a container twice, so
  // this deliberately does not depend on `sites`.
  useEffect(() => {
    if (!holder.current || map.current) return;
    const m = L.map(holder.current, { scrollWheelZoom: false }).setView([24.7, 46.7], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // (Re)draw markers whenever either set changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.eachLayer((layer) => {
      if (layer instanceof L.Marker) layer.remove();
    });

    const usable = sites.filter(
      (s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    );
    usable.forEach((s) => {
      L.marker([s.latitude, s.longitude], { icon: pinIcon(s), title: s.siteName })
        .addTo(m)
        .bindPopup(
          `<div style="direction:rtl;text-align:right"><b>${escapeHtml(s.siteName)}</b>` +
          `<br/><span dir="ltr">${escapeHtml(s.siteCode)}</span>` +
          `<br/><span dir="ltr">${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}</span></div>`
        );
    });

    const usableVehicles = vehicles.filter(
      (v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)
    );
    // Group dots that share a ~100 m cell: twenty trucks parked at the depot
    // are one tappable badge, not twenty unreachable markers under each other.
    const groups = new Map<string, MapVehicle[]>();
    for (const v of usableVehicles) {
      const k = `${v.latitude.toFixed(3)},${v.longitude.toFixed(3)}`;
      const g = groups.get(k);
      if (g) g.push(v);
      else groups.set(k, [v]);
    }
    const vehiclePopup = (v: MapVehicle) => {
      const label = [v.vehicleCode, v.plateNumber].filter(Boolean).join(' · ');
      return (
        `<div style="direction:rtl;text-align:right"><b dir="ltr">${escapeHtml(label)}</b>` +
        `<br/>${escapeHtml(v.nearestLine)}` +
        (v.statusLine ? `<br/>${escapeHtml(v.statusLine)}` : '') +
        `<br/>${escapeHtml(v.distanceLine)}` +
        `<br/><span style="opacity:.7">${escapeHtml(v.ageLine)}</span>` +
        (v.detailHref ? `<br/><a href="${escapeHtml(v.detailHref)}" style="color:#38bdf8;font-weight:bold">${escapeHtml(v.detailLabel || '⇢')}</a>` : '') +
        `</div>`
      );
    };
    groups.forEach((gv) => {
      const first = gv[0];
      if (gv.length === 1) {
        L.marker([first.latitude, first.longitude], { icon: vehicleIcon(first), title: first.vehicleCode })
          .addTo(m)
          .bindPopup(vehiclePopup(first));
        return;
      }
      // Stacked badge: count + tap opens the React list card (see below).
      const staleAll = gv.every((v) => v.isStale);
      const n = gv.length;
      const badge = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:72px;height:40px;">` +
          `<div style="position:absolute;top:0;left:50%;transform:translateX(-50%);white-space:nowrap;` +
          `background:#f59e0b;color:#000;font-size:11px;font-weight:900;line-height:1.6;` +
          `padding:0 8px;border-radius:9999px;">${n} 🚛</div>` +
          `<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);` +
          `width:18px;height:18px;border-radius:9999px;` +
          `background:${staleAll ? 'transparent' : '#f59e0b'};border:3px solid #f59e0b;"></div></div>`,
        iconSize: [72, 40],
        iconAnchor: [36, 40],
      });
      L.marker([first.latitude, first.longitude], { icon: badge, title: `${n} مركبات` })
        .addTo(m)
        .on('click', () => {
          setFocused(null);
          setPicked([...gv].sort((a, b) => a.vehicleCode.localeCompare(b.vehicleCode, 'ar')));
        });
    });

    // Fit to sites AND trucks. Fitting to the sites only would leave a truck
    // 800 km away (correctly) invisible at the edge of the viewport, which reads
    // as "no truck is out there" rather than "one is, and it is off-screen".
    const points: [number, number][] = [
      ...usable.map((s) => [s.latitude, s.longitude] as [number, number]),
      ...usableVehicles.map((v) => [v.latitude, v.longitude] as [number, number]),
    ];
    // Only when we actually have some — fitting to an empty set throws, and there
    // is nothing useful to show anyway.
    if (points.length > 0) {
      m.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
    }
  }, [sites, vehicles]);

  const fmtTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <div className={className} style={{ position: 'relative' }}>
      <div ref={holder} style={{ width: '100%', height: '100%' }} />
      {picked && (
        <div dir="rtl" style={{
          position: 'absolute', top: 8, right: 8, zIndex: 500,
          width: 250, maxHeight: '75%', overflowY: 'auto',
          background: 'rgba(2,6,16,.94)', border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 14, padding: 10, color: '#fff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <b style={{ fontSize: 12 }}>🚛 {picked.length} مركبات هنا</b>
            <button onClick={() => { setPicked(null); setFocused(null); }}
              style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '2px 8px', fontSize: 11, color: '#fff', background: 'transparent' }}>✕</button>
          </div>
          {!focused ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {picked.map((v) => (
                <button key={v.vehicleId} onClick={() => setFocused(v)}
                  style={{
                    textAlign: 'right', background: 'rgba(255,255,255,.05)', color: '#fff',
                    border: '1px solid rgba(255,255,255,.1)', borderRadius: 10, padding: '6px 8px', fontSize: 12,
                  }}>
                  <b dir="ltr">{v.vehicleCode}</b>
                  <span style={{ color: '#94a3b8' }}> · {v.plateNumber}</span>
                  <br />
                  <span style={{ fontSize: 10, color: v.isStale ? '#94a3b8' : '#34d399' }}>
                    {v.isStale ? '⚪ ' : '🟢 '}{v.ageLine}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12 }}>
              <button onClick={() => setFocused(null)}
                style={{ color: '#38bdf8', fontSize: 11, background: 'transparent', border: 'none', marginBottom: 4 }}>→ رجوع للقائمة</button>
              <p style={{ fontWeight: 900, fontSize: 14 }}><span dir="ltr">{focused.vehicleCode}</span> · {focused.plateNumber}</p>
              {focused.statusLine && <p style={{ color: '#cbd5e1', marginTop: 2 }}>{focused.statusLine}</p>}
              <p style={{ color: '#cbd5e1', marginTop: 4 }}>📡 آخر إشارة: <b>{focused.ageLine}</b></p>
              {focused.capturedAt && <p dir="ltr" style={{ color: '#94a3b8', fontSize: 11 }}>{fmtTime(focused.capturedAt)}</p>}
              <p style={{ color: '#cbd5e1', marginTop: 4 }}>📍 {focused.nearestLine}</p>
              {focused.distanceLine && <p style={{ color: '#94a3b8', fontSize: 11 }}>{focused.distanceLine}</p>}
              <p dir="ltr" style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                {focused.latitude.toFixed(5)}, {focused.longitude.toFixed(5)}
              </p>
              {focused.detailHref && (
                <a href={focused.detailHref} style={{ color: '#38bdf8', fontWeight: 800, display: 'block', marginTop: 6 }}>
                  {focused.detailLabel || '⇢'}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Site names are operator-typed; never interpolate them into popup HTML raw. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}