/**
 * Server URL override (mobile + desktop flavour).
 *
 * The API base is baked in at build time, which means pointing a plant at its
 * own server would need a new installer. A plain URL is not a secret, so it is
 * stored locally and read on every request — same approach as the website's
 * `fimto_server_url`. Changing it drops the stored session because the tokens
 * belong to the previous server.
 */

const SERVER_URL_KEY = "fimto_server_url";

function sanitise(url: string): string | null {
  const trimmed = (url || "").trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed.replace(/\/+$/, "");
}

/** Current override, or null when the built-in default should be used. */
export function getServerUrl(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return sanitise(localStorage.getItem(SERVER_URL_KEY) || "");
  } catch {
    return null;
  }
}

/** Persist an override; pass an empty string to fall back to the default. */
export function setServerUrl(url: string): string | null {
  if (typeof localStorage === "undefined") return null;
  const clean = sanitise(url);
  try {
    if (clean) localStorage.setItem(SERVER_URL_KEY, clean);
    else localStorage.removeItem(SERVER_URL_KEY);
  } catch {
    return null;
  }
  return clean;
}

/**
 * Base URL for every API call: the override when set, otherwise the build-time
 * default. `/api` is appended because the override is a plain origin.
 */
export function resolveApiBase(fallback: string): string {
  const override = getServerUrl();
  if (!override) return fallback;
  return override.endsWith("/api") ? override : `${override}/api`;
}
