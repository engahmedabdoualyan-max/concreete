import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loadTrips, loadOrders, loadCustomers } from "../firebase/firestore";

/**
 * Field "my work" lists (desktop-first).
 * Driver → my trips (matched by driver name/phone/username).
 * Sales → my customers + recent orders.
 * Others → shortcuts to the full dashboard sections.
 */
function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function tripStatus(t: Record<string, unknown>): string {
  return String(t.status ?? t.state ?? "—");
}

export default function MyWork() {
  const { currentUser } = useAuth();
  const [trips, setTrips] = useState<Record<string, unknown>[]>([]);
  const [orders, setOrders] = useState<Record<string, unknown>[]>([]);
  const [customers, setCustomers] = useState<Record<string, unknown>[]>([]);

  const role = norm(currentUser?.role);
  const me = [
    norm(currentUser?.username),
    norm(currentUser?.phone),
    norm(currentUser?.fullName),
    norm(currentUser?.email),
  ].filter(Boolean);

  useEffect(() => {
    if (!currentUser) return;
    const u = currentUser.username;
    Promise.all([
      loadTrips(u).catch(() => []),
      loadOrders(u).catch(() => []),
      loadCustomers(u).catch(() => []),
    ]).then(([t, o, c]) => {
      setTrips(Array.isArray(t) ? (t as Record<string, unknown>[]) : []);
      setOrders(Array.isArray(o) ? (o as Record<string, unknown>[]) : []);
      setCustomers(Array.isArray(c) ? (c as Record<string, unknown>[]) : []);
    });
  }, [currentUser]);

  const myTrips = trips.filter((t) =>
    me.some(
      (m) =>
        m &&
        (norm(t.driver).includes(m) ||
          norm(t.driverName).includes(m) ||
          norm(t.driverPhone).includes(m))
    )
  );
  const shownTrips = myTrips.length > 0 ? myTrips : trips.slice(0, 20);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-black text-white">
          {role === "driver" ? "🚚 رحلاتي" : role === "sales" ? "🧾 طلباتي وعملائي" : "📋 شغلي"}
        </h2>
        <Link to="/field" className="text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg px-3 py-2">→ الميدان</Link>
      </div>

      {(role === "driver" || myTrips.length > 0 || trips.length > 0) && (
        <div className="mb-6">
          <p className="text-xs font-bold text-slate-400 mb-2">الرحلات ({shownTrips.length})</p>
          <div className="space-y-2">
            {shownTrips.slice(0, 20).map((t, i) => (
              <div key={String(t.id ?? i)} className="border border-white/10 bg-white/[0.03] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white">
                    {(t.qty ?? t.quantity ?? t.volume ?? "—") as string} م³ · {String(t.siteName ?? t.projectName ?? t.project ?? "—")}
                  </p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold">{tripStatus(t)}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {String(t.date ?? "")} · السائق: {String(t.driver ?? t.driverName ?? "—")}
                </p>
              </div>
            ))}
            {shownTrips.length === 0 && <p className="text-xs text-slate-500">لا رحلات مسجلة</p>}
          </div>
        </div>
      )}

      {(role === "sales" || role === "ptown" || role === "sysadmin") && (
        <div className="mb-6">
          <p className="text-xs font-bold text-slate-400 mb-2">العملاء ({customers.length})</p>
          <div className="space-y-2">
            {customers.slice(0, 20).map((c, i) => (
              <div key={String((c as Record<string, unknown>).id ?? i)} className="border border-white/10 bg-white/[0.03] rounded-xl px-4 py-3">
                <p className="text-sm font-bold text-white">{String(c.name ?? c.customerName ?? "—")}</p>
                <p className="text-[11px] text-slate-400 mt-1">{String(c.phone ?? c.customerPhone ?? "")}</p>
              </div>
            ))}
            {customers.length === 0 && <p className="text-xs text-slate-500">لا عملاء مسجلين</p>}
          </div>
          <p className="text-xs font-bold text-slate-400 mt-4 mb-2">أحدث الطلبات ({orders.length})</p>
          <div className="space-y-2">
            {orders.slice(0, 10).map((o, i) => (
              <div key={String(o.id ?? i)} className="border border-white/10 bg-white/[0.03] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white">{String(o.customerName ?? o.projectName ?? "طلب")}</p>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 font-bold">{tripStatus(o)}</span>
                </div>
              </div>
            ))}
            {orders.length === 0 && <p className="text-xs text-slate-500">لا طلبات مسجلة</p>}
          </div>
        </div>
      )}

      {role !== "driver" && role !== "sales" && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { to: "/operations", icon: "🚚", label: "التشغيل" },
            { to: "/orders", icon: "🧾", label: "الطلبات" },
            { to: "/production", icon: "🏭", label: "الإنتاج" },
            { to: "/workshop", icon: "🔧", label: "الورشة" },
            { to: "/finance", icon: "💰", label: "المالية" },
            { to: "/field/rnd", icon: "🧪", label: "البحث والتطوير" },
            { to: "/field/tracking", icon: "🛰️", label: "المتابعة" },
          ].map((l) => (
            <Link key={l.to} to={l.to} className="border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl px-4 py-4 text-center">
              <div className="text-2xl">{l.icon}</div>
              <p className="text-xs font-bold text-white mt-1">{l.label}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
