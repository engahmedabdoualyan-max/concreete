import { Link, useLocation } from "react-router-dom";
import { useFieldNotifications } from "./NotificationsCenter";

/**
 * Slim fixed bottom bar for field screens (replaces the big website footer
 * there — the website footer itself is untouched). Desktop and web alike:
 * field routes are app-like, so navigation stays one tap away.
 */
export default function FieldFixedBar() {
  const loc = useLocation();
  const { unread } = useFieldNotifications(30000);
  if (!loc.pathname.startsWith("/field")) return null;

  const tabs = [
    { to: "/field", icon: "🏠", label: "الميدان" },
    { to: "/field/work", icon: "📋", label: "شغلي" },
    { to: "/field/tracking", icon: "🛰️", label: "المتابعة" },
    { to: "/field/notifications", icon: "🔔", label: "التنبيهات", badge: unread },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[90] bg-[#0B111E]/95 backdrop-blur border-t border-white/10">
      <div className="max-w-3xl mx-auto px-2 py-1.5 grid grid-cols-4 gap-1">
        {tabs.map((t) => {
          const active = loc.pathname === t.to;
          return (
            <Link
              key={t.to + t.label}
              to={t.to}
              className={`relative flex flex-col items-center py-1.5 rounded-lg text-[10px] font-bold ${
                active ? "text-sky-300 bg-sky-500/10" : "text-slate-400"
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="mt-0.5">{t.label}</span>
              {t.badge ? (
                <span className="absolute top-0.5 right-1/2 translate-x-4 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {t.badge > 9 ? "9+" : t.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
