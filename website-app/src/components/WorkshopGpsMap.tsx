import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useWorkshopGpsMapDict } from '../i18n/workshopGpsMapDict';
import type { Asset } from '../pages/Workshop';

/**
 * Workshop mini GPS map — plots assets that have gpsLat/gpsLng.
 * Peripheral-friendly: if no trackers connected / no coordinates,
 * shows a calm hint instead of an empty map (system works fine without).
 */
export default function WorkshopGpsMap({ assets }: { assets: Asset[] }) {
  const t = useWorkshopGpsMapDict();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const geoAssets = assets.filter(a => typeof a.gpsLat === 'number' && typeof a.gpsLng === 'number');

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    map.setView([26.4207, 50.0888], 10);
    mapInstance.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (geoAssets.length === 0) return;
    geoAssets.forEach(a => {
      const ready = a.status === 'Ready' || a.status === 'جاهز';
      const color = ready ? '#34d399' : '#fbbf24';
      L.circleMarker([a.gpsLat!, a.gpsLng!], {
        radius: 9, color, fillColor: color, fillOpacity: 0.85, weight: 2,
      }).bindTooltip(`🚚 ${a.plate || a.id} · ${a.driver || '—'}`).addTo(layer);
    });
    map.fitBounds(L.latLngBounds(geoAssets.map(a => [a.gpsLat!, a.gpsLng!] as [number, number])).pad(0.3));
  }, [assets]);

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-5">
      <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
        <h3 className="text-lg font-bold text-white">{t('fleetTitle')}</h3>
        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${geoAssets.length > 0
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-sky-500/10 text-sky-300 border-white/10'}`}>
          {geoAssets.length > 0
            ? t('gpsCount').replace('{n}', String(geoAssets.length))
            : t('noTrackers')}
        </span>
      </div>
      {geoAssets.length > 0 ? (
        <div ref={mapRef} className="w-full h-[240px] rounded-lg overflow-hidden border border-white/10" style={{ background: '#0d1420' }} />
      ) : (
        <div className="border border-dashed border-white/10 rounded-lg p-6 text-center text-sm text-slate-400">
          {t('hintPre')}<strong className="text-indigo-300">{t('peripheralDevices')}</strong>{t('hintPost')}
        </div>
      )}
    </div>
  );
}
