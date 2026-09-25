import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../context/AuthContext";
import {
  loadPlantGPS,
  getAllLivePositions,
  type LivePosEntry,
} from "../firebase/firestore";

/**
 * Field live tracking (desktop-first follow-up map).
 * Plant HQ + live fleet positions, auto-refresh. Read-only.
 */
type Pos = LivePosEntry & { username: string; plantName: string };

export default function Tracking() {
  const { currentUser } = useAuth();
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const [positions, setPositions] = useState<Pos[]>([]);
  const [plant, setPlant] = useState<{ lat: number; lng: number } | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    if (!currentUser || mapRef.current || !mapRef.current) return;
    if (mapObj.current) return;
    const map = L.map(mapRef.current).setView([24.7, 46.7], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapObj.current = map;
    return () => {
      map.remove();
      mapObj.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  const reload = async () => {
    try {
      const [pos, gps] = await Promise.all([
        getAllLivePositions(),
        currentUser ? loadPlantGPS(currentUser.username) : Promise.resolve(null),
      ]);
      setPositions(pos || []);
      setPlant(gps);
      setUpdatedAt(new Date().toLocaleTimeString());
      const layer = layerRef.current;
      const map = mapObj.current;
      if (layer && map) {
        layer.clearLayers();
        if (gps) {
          layer.addLayer(
            L.marker([gps.lat, gps.lng], {
              icon: L.divIcon({ html: "🏭", className: "", iconSize: [28, 28] }),
            }).bindPopup("<b>المحطة</b>")
          );
        }
        (pos || []).forEach((p) => {
          layer.addLayer(
            L.marker([p.lat, p.lng], {
              icon: L.divIcon({ html: "🚚", className: "", iconSize: [26, 26] }),
            }).bindPopup(`<b>${p.plantName}</b><br/>${p.username}`)
          );
        });
        if ((pos || []).length > 0) {
          const bounds = L.latLngBounds((pos || []).map((p) => [p.lat, p.lng] as [number, number]));
          if (gps) bounds.extend([gps.lat, gps.lng]);
          map.fitBounds(bounds.pad(0.2));
        } else if (gps) {
          map.setView([gps.lat, gps.lng], 12);
        }
      }
    } catch {
      /* offline — keep last frame */
    }
  };

  useEffect(() => {
    reload();
    const t = window.setInterval(reload, 20000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-black text-white">🛰️ المتابعة الحية</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">آخر تحديث: {updatedAt || "—"}</span>
          <Link to="/field" className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-2">→ الميدان</Link>
        </div>
      </div>
      <div ref={mapRef} className="w-full rounded-2xl border border-white/10 overflow-hidden" style={{ height: 420 }} />
      <p className="text-xs text-slate-400 mt-3">
        🚚 {positions.length} مركبة نشطة {plant ? "· 🏭 موقع المحطة ظاهر" : ""}
      </p>
    </div>
  );
}
