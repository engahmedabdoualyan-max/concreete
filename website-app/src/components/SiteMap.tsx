import { useEffect, useRef } from 'react';
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
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:${inside ? '9999px' : '3px'};
      background:${v.isStale ? 'transparent' : color};
      border:2px solid ${color};
      ${inside ? `box-shadow:0 0 0 4px ${color}40;` : ''}
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function SiteMap({ sites, vehicles = [], className = '' }: Props) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<L.Map | null>(null);

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
    usableVehicles.forEach((v) => {
      const label = [v.vehicleCode, v.plateNumber].filter(Boolean).join(' · ');
      L.marker([v.latitude, v.longitude], { icon: vehicleIcon(v), title: label })
        .addTo(m)
        .bindPopup(
          `<div style="direction:rtl;text-align:right"><b dir="ltr">${escapeHtml(label)}</b>` +
          `<br/>${escapeHtml(v.nearestLine)}` +
          `<br/>${escapeHtml(v.distanceLine)}` +
          `<br/><span style="opacity:.7">${escapeHtml(v.ageLine)}</span></div>`
        );
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

  return <div ref={holder} className={className} />;
}

/** Site names are operator-typed; never interpolate them into popup HTML raw. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}