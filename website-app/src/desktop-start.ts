import { loadSession } from "./api/client";

/**
 * Desktop-only startup behaviour (Tauri builds).
 * The website intentionally opens in guest mode, but the desktop app is a
 * plant workstation: it must open on the login screen (which also hosts
 * 🖥️ server settings) when no session exists. Web browsers are untouched.
 */
function isTauriRuntime(): boolean {
  try {
    return typeof window !== "undefined" && "__TAURI__" in window;
  } catch {
    return false;
  }
}

function hasSavedSession(): boolean {
  try {
    // Real ERP login — stays where it is.
    if (loadSession()) return true;
    // Website AuthContext sessions: a persisted GUEST session does NOT count —
    // otherwise the desktop app would reopen in guest mode forever instead of
    // showing the login screen (the exact bug reported from the AppImage).
    for (const store of [window.localStorage, window.sessionStorage]) {
      const raw = store.getItem("currentUserSession");
      if (!raw) continue;
      try {
        const s = JSON.parse(raw) as { username?: string; status?: string; role?: string };
        const tag = `${s.username ?? ""} ${s.status ?? ""} ${s.role ?? ""}`.toLowerCase();
        if (!tag.includes("guest")) return true;
      } catch {
        return true; // unreadable blob — assume a real session, don't redirect
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function redirectDesktopToLogin(): void {
  try {
    if (!isTauriRuntime() || hasSavedSession()) return;
    const h = window.location.hash || "#/";
    if (h === "#/" || h === "#" || h === "") window.location.hash = "#/login";
  } catch {
    /* never block startup */
  }
}
