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
    if (loadSession()) return true;
    if (window.localStorage.getItem("currentUserSession")) return true;
    return !!window.sessionStorage.getItem("currentUserSession");
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
