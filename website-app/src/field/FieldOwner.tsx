import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  loadTrips,
  loadOrders,
  loadInventory,
  loadQCRecords,
  loadPayments,
  loadAssets,
} from "../firebase/firestore";

/**
 * Owner evaluation overview (field-native, read-only).
 * The screen that distinguishes the plant/company owner: every department
 * rated + production comparisons (volume per mixer, orders pipeline).
 * Same workspace stores as the website Evaluation page.
 */
interface Section {
  key: string;
  icon: string;
  title: string;
  score: number;
  detail: string;
}

function pct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function scoreColor(s: number): string {
  return s >= 80 ? "#34D399" : s >= 60 ? "#FBBF24" : "#F87171";
}

export default function FieldOwner() {
  const { currentUser } = useAuth();
  const [sections, setSections] = useState<Section[]>([]);
  const [overall, setOverall] = useState(0);
  const [mixers, setMixers] = useState<{ name: string; vol: number; trips: number }[]>([]);
  const [pipeline, setPipeline] = useState<{ label: string; count: number }[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    const u = currentUser.username;
    Promise.all([
      loadTrips(u).catch(() => []),
      loadOrders(u).catch(() => []),
      loadInventory(u).catch(() => ({})),
      loadQCRecords(u).catch(() => []),
      loadPayments(u).catch(() => []),
      loadAssets(u).catch(() => []),
    ]).then(([tripsR, ordersR, invR, qcR, payR, assetsR]) => {
      const trips: Record<string, unknown>[] = Array.isArray(tripsR) ? tripsR : [];
      const orders: Record<string, unknown>[] = Array.isArray(ordersR) ? ordersR : [];
      const qc: Record<string, unknown>[] = Array.isArray(qcR) ? qcR : [];
      const pays: Record<string, unknown>[] = Array.isArray(payR) ? payR : [];
      const assets: Record<string, unknown>[] = Array.isArray(assetsR) ? assetsR : [];
      const inv: Record<string, { qty?: number; min?: number }> =
        invR && typeof invR === "object" ? (invR as Record<string, { qty?: number; min?: number }>) : {};

      const done = trips.filter((t) => String(t.status ?? "").toUpperCase() === "COMPLETED").length;
      const vol = trips.reduce((s, t) => s + (Number(t.qty ?? t.quantity ?? 0) || 0), 0);
      const approved = orders.filter((o) =>
        ["approved", "scheduled"].includes(String(o.accountStatus ?? o.status ?? "").toLowerCase())
      ).length;
      const invKeys = Object.keys(inv);
      const lowStock = invKeys.filter((k) => Number(inv[k]?.qty ?? 1) <= Number(inv[k]?.min ?? 0)).length;
      const readyAssets = assets.filter((a) =>
        ["ready", "available", "جاهزة"].includes(String(a.status ?? "").toLowerCase())
      ).length;
      const qcPass = qc.filter((q) =>
        ["pass", "passed", "مقبول", "ناجح"].includes(String(q.result ?? q.status ?? "").toLowerCase())
      ).length;

      const secs: Section[] = [
        {
          key: "ops", icon: "🚚", title: "التشغيل", score: trips.length ? pct((done / trips.length) * 100) : 0,
          detail: `${done}/${trips.length} رحلة مكتملة`,
        },
        {
          key: "prod", icon: "🏭", title: "الإنتاج", score: invKeys.length ? pct(((invKeys.length - lowStock) / invKeys.length) * 100) : 0,
          detail: `${Math.round(vol * 100) / 100} م³ إجمالي · ${lowStock} خامة ناقصة`,
        },
        {
          key: "workshop", icon: "🔧", title: "الورشة", score: assets.length ? pct((readyAssets / assets.length) * 100) : 0,
          detail: `${readyAssets}/${assets.length} معدة جاهزة`,
        },
        {
          key: "finance", icon: "💰", title: "المالية", score: orders.length ? pct((approved / orders.length) * 100) : 0,
          detail: `${approved}/${orders.length} معتمد · ${pays.length} مدفوعة`,
        },
        {
          key: "lab", icon: "🧪", title: "المعمل", score: qc.length ? pct((qcPass / qc.length) * 100) : 0,
          detail: `${qcPass}/${qc.length} فحص ناجح`,
        },
        {
          key: "sales", icon: "🧾", title: "المبيعات", score: orders.length ? pct(Math.min(orders.length / 10, 1) * 100) : 0,
          detail: `${orders.length} طلب مسجل`,
        },
      ];
      setSections(secs);
      setOverall(Math.round(secs.reduce((s, x) => s + x.score, 0) / Math.max(secs.length, 1)));

      const byMixer = new Map<string, { vol: number; trips: number }>();
      trips.forEach((t) => {
        const name = String(t.driver ?? t.driverName ?? t.plate ?? "—");
        const e = byMixer.get(name) || { vol: 0, trips: 0 };
        e.vol += Number(t.qty ?? t.quantity ?? 0) || 0;
        e.trips += 1;
        byMixer.set(name, e);
      });
      setMixers(
        [...byMixer.entries()]
          .map(([name, v]) => ({ name, vol: Math.round(v.vol * 100) / 100, trips: v.trips }))
          .sort((a, b) => b.vol - a.vol)
          .slice(0, 8)
      );

      const st = new Map<string, number>();
      orders.forEach((o) => {
        const k = String(o.accountStatus ?? o.status ?? "—");
        st.set(k, (st.get(k) || 0) + 1);
      });
      setPipeline([...st.entries()].map(([label, count]) => ({ label, count })));
    });
  }, [currentUser]);

  const maxVol = Math.max(1, ...mixers.map((m) => m.vol));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black text-white">📊 تقييم المحطة</h2>
        <Link to="/field" className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-2">→ الميدان</Link>
      </div>

      <div className="text-center bg-white/[0.03] border border-white/10 rounded-2xl py-5 mb-4">
        <p className="text-[11px] text-slate-500">التقييم العام</p>
        <p className="text-5xl font-black mt-1" style={{ color: scoreColor(overall) }}>{overall}</p>
        <p className="text-[11px] text-slate-500 mt-1">من 100 — متوسط الأقسام الستة</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {sections.map((s) => (
          <div key={s.key} className="border border-white/10 bg-white/[0.03] rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-white">{s.icon} {s.title}</p>
              <p className="text-lg font-black" style={{ color: scoreColor(s.score) }}>{s.score}</p>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${s.score}%`, backgroundColor: scoreColor(s.score) }} />
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">{s.detail}</p>
          </div>
        ))}
      </div>

      <p className="text-xs font-black text-slate-300 mb-2">🚚 مقارنة الإنتاج حسب السائق</p>
      <div className="space-y-2 mb-5">
        {mixers.map((m) => (
          <div key={m.name}>
            <div className="flex justify-between text-[11px] text-slate-300 mb-0.5">
              <span className="font-bold">{m.name}</span>
              <span>{m.vol} م³ · {m.trips} رحلة</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.round((m.vol / maxVol) * 100)}%` }} />
            </div>
          </div>
        ))}
        {mixers.length === 0 && <p className="text-xs text-slate-500">لا بيانات رحلات بعد</p>}
      </div>

      <p className="text-xs font-black text-slate-300 mb-2">🧾 خط الطلبات</p>
      <div className="flex flex-wrap gap-2">
        {pipeline.map((p) => (
          <span key={p.label} className="text-[11px] font-bold border border-white/10 bg-white/[0.04] text-slate-200 rounded-full px-3 py-1.5">
            {p.label}: {p.count}
          </span>
        ))}
        {pipeline.length === 0 && <p className="text-xs text-slate-500">لا طلبات مسجلة</p>}
      </div>
    </div>
  );
}
