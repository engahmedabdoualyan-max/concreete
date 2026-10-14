/**
 * Desktop (Tauri) runtime helpers — shared by desktop-start + field screens.
 * Web browsers are never affected: every helper is a no-op off Tauri.
 */

/** True only inside the Tauri WebView (desktop builds). */
export function isTauriRuntime(): boolean {
  try {
    if (typeof window === "undefined") return false;
    // Tauri v2 does not guarantee window.__TAURI__ (withGlobalTauri defaults
    // to false); __TAURI_INTERNALS__ is always injected by the bridge.
    return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

let notifyAsked = false;

/** Ask once for desktop notification permission (no-op / false off Tauri). */
export async function ensureNotifyPermission(): Promise<boolean> {
  try {
    if (!isTauriRuntime() || !("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    if (notifyAsked) return false;
    notifyAsked = true;
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/** Desktop toast for a new notification (no-op off Tauri or without permission). */
export function notifyDesktop(title: string, body: string): void {
  try {
    if (!isTauriRuntime() || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    new Notification(title, { body, tag: `fimto-${Date.now()}` });
  } catch {
    /* never break the UI */
  }
}
