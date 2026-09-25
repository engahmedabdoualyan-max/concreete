import { Link, useLocation } from "react-router-dom";
import { isTauriRuntime } from "./tauri";

/**
 * Desktop-only floating back button (mounted in App, next to FloatingActions).
 * On any non-field route inside the desktop app, one tap returns to the
 * field hub. Never rendered in browsers — website navigation is untouched.
 */
export default function FieldBackButton() {
  const loc = useLocation();
  if (!isTauriRuntime()) return null;
  if (loc.pathname.startsWith("/field") || loc.pathname === "/login") return null;
  return (
    <Link
      to="/field"
      title="رجوع للميدان"
      className="fixed bottom-5 left-5 z-[90] w-12 h-12 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-xl font-black flex items-center justify-center shadow-[0_0_24px_rgba(56,189,248,0.45)]"
    >
      🏠
    </Link>
  );
}
