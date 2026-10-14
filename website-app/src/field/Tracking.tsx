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

  const [mapError, setMapError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    if (!mapRef.current || mapObj.current) return;
    try {
      const map = L.map(mapRef.current).setView([24.7, 46.7], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapObj.current = map;
      // Leaflet measures a hidden container as 0×0 — recalc after paint.
      window.setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {
          /* ignore */
        }
      }, 300);
    } catch (e) {
      setMapError(e instanceof Error ? e.message : "تعذر إنشاء الخريطة");
    }
    return () => {
      try {
        mapObj.current?.remove();
      } catch {
        /* ignore */
      }
      mapObj.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.username]);

  const reload = async () => {
    setMapError("");
    const timeout = (ms: number) =>
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), ms));
    try {
      const [pos, gps] = (await Promise.race([
        Promise.all([
          getAllLivePositions(),
          currentUser ? loadPlantGPS(currentUser.username) : Promise.resolve(null),
        ]),
        timeout(12000),
      ])) as [Pos[], { lat: number; lng: number } | null];
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
    } catch (e) {
      setMapError("تعذر تحميل المواقع — تحقق من الإنترنت ثم حدّث");
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
      <div ref={mapRef} className="w-full rounded-2xl border border-white/10 overflow-hidden" style={{ height: 420, minHeight: 420 }} />
      {mapError && (
        <p className="text-xs font-bold text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 mt-3">
          ⚠️ {mapError}
        </p>
      )}
      {!currentUser && (
        <p className="text-xs text-slate-400 mt-3">
          سجل الدخول أولاً لعرض مواقع محطتك — <Link to="/login" className="text-sky-300 font-bold">الدخول</Link>
        </p>
      )}
      <p className="text-xs text-slate-400 mt-3">
        🚚 {positions.length} مركبة نشطة {plant ? "· 🏭 موقع المحطة ظاهر" : ""}
      </p>
    </div>
  );
}
