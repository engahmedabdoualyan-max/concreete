/**
 * Server auto-discovery (web/desktop flavour).
 *
 * The API server can move: a Render free service sleeps, a Cloudflare quick
 * tunnel gets a new hostname on every restart. Instead of baking an address
 * into the installer, the app reads a plain-text file from the website and
 * adopts the URL it finds — unless the user pinned one on the login screen, which
 * always wins.
 *
 * The file is expected at: https://concreete.vercel.app/fimto-api-url.txt
 */

const DISCOVERY_URL =
  "https://concreete.vercel.app/fimto-api-url.txt";

/** True when the user pinned a server on the login screen. */
export function hasPinnedServer(): boolean {
  try {
    return Boolean(localStorage.getItem("fimto_server_url"));
  } catch {
    return false;
  }
}

/**
 * Fetch the published API URL and remember it. Never throws: on any failure the
 * app simply keeps its built-in default.
 */
export async function discoverApiServer(timeoutMs = 6000): Promise<string | null> {
  if (typeof fetch === "undefined" || hasPinnedServer()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${DISCOVERY_URL}?t=${Date.now()}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    if (!/^https?:\/\/[^\s]+$/i.test(text)) return null;
    const { setServerUrl } = await import("./server-url");
    return setServerUrl(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
