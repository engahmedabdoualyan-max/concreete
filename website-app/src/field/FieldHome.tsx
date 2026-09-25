import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useFieldNotifications } from "./NotificationsCenter";

/**
 * Field home (desktop-first app-like hub, harmless on web).
 * Greets by plant + role, offers: my work, live tracking, notifications
 * (with unread badge), and a link to the full dashboard.
 */
function roleAr(role: string): string {
  const r = (role || "").toLowerCase();
  if (r.includes("driver") || r.includes("سائق")) return "سائق";
  if (r.includes("sales") || r.includes("مندوب")) return "مندوب مبيعات";
  if (r.includes("account")) return "محاسب";
  if (r.includes("dispatch")) return "ديسباتشر";
  if (r.includes("workshop") || r.includes("ورشة")) return "الورشة";
  if (r.includes("lab") || r.includes("معمل") || r.includes("مختبر")) return "المعمل";
  if (r.includes("batch") || r.includes("خلاط")) return "الخلاطة";
  if (r.includes("manager") || r.includes("مدير")) return "إدارة";
  if (r.includes("owner") || r.includes("admin") || r.includes("ptown")) return "المالك";
  return role || "—";
}

export default function FieldHome() {
  const { currentUser, logout } = useAuth();
  const { unread } = useFieldNotifications(30000);
  const navigate = useNavigate();

  const name = currentUser?.fullName || currentUser?.username || "—";
  const plant = currentUser?.plantName || "";

  const cards = [
    { to: "/field/work", icon: "📋", title: "شغلي", desc: "رحلاتي / طلباتي / عملائي حسب دوري" },
    { to: "/field/tracking", icon: "🛰️", title: "المتابعة الحية", desc: "مواقع الشاحنات والمحطة على الخريطة" },
    { to: "/field/notifications", icon: "🔔", title: "التنبيهات", desc: "كل جديد أولاً بأول", badge: unread },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <p className="text-xs text-slate-500">أهلاً</p>
        <h2 className="text-2xl font-black text-white mt-1">{name}</h2>
        <p className="text-sm text-sky-300 font-bold mt-1">
          {roleAr(currentUser?.role || "")}{plant ? ` · ${plant}` : ""}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {cards.map((c) => (
          <Link
            key={c.to + c.title}
            to={c.to}
            className="relative border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] rounded-2xl p-5 text-center transition-colors"
          >
            {c.badge ? (
              <span className="absolute top-2 left-2 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                {c.badge > 9 ? "9+" : c.badge}
              </span>
            ) : null}
            <div className="text-4xl">{c.icon}</div>
            <p className="text-sm font-black text-white mt-2">{c.title}</p>
            <p className="text-[11px] text-slate-400 mt-1">{c.desc}</p>
          </Link>
        ))}
      </div>
      <button
        onClick={() => {
          logout();
          navigate("/login");
        }}
        className="w-full mt-6 text-xs font-bold text-slate-400 hover:text-red-300 border border-white/10 rounded-xl py-3"
      >
        تسجيل الخروج
      </button>
    </div>
  );
}
