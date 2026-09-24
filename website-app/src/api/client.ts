/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP · Website API Client
 * ============================================================
 *
 *  Single HTTP client for the website SPA → ERP backend.
 *  - Configurable base URL (VITE_API_URL) with sane defaults
 *  - Bearer token storage + automatic refresh on 401
 *  - Local cache fallback so the app never hard-crashes offline
 * ============================================================
 */

const DEV_API = "http://127.0.0.1:3000";
const PROD_API = "https://concrete.fimtosoft.com";

export const API_BASE: string =
  (import.meta.env?.VITE_API_URL as string) ||
  (import.meta.env?.DEV ? DEV_API : PROD_API);

/**
 * Runtime server-URL override (desktop app + private servers).
 * Stored in localStorage (a plain URL is not a secret) and read on every
 * request, so each plant can point the app at its own server without a
 * rebuild. Changing it wipes the session (tokens belong to the old server).
 */
export const SERVER_URL_KEY = "fimto_server_url";

export function resolveApiBase(): string {
  try {
    const saved = window.localStorage.getItem(SERVER_URL_KEY);
    if (saved && /^https?:\/\//i.test(saved)) return saved.replace(/\/+$/, "");
  } catch {
    /* storage unavailable — fall through to default */
  }
  return API_BASE;
}

export function getServerUrl(): string | null {
  try {
    return window.localStorage.getItem(SERVER_URL_KEY);
  } catch {
    return null;
  }
}

export function setServerUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+/i.test(clean)) throw new Error("رابط غير صالح");
  window.localStorage.setItem(SERVER_URL_KEY, clean);
  clearSession();
}

export function clearServerUrl(): void {
  try {
    window.localStorage.removeItem(SERVER_URL_KEY);
  } catch {
    /* ignore */
  }
}

export const TOKEN_KEY = "fimto_access_token";
export const REFRESH_KEY = "fimto_refresh_token";
export const SESSION_KEY = "fimto_user_session";

/**
 * Keep web tokens out of persistent localStorage in production. This is not a
 * replacement for HttpOnly cookies, but it reduces the lifetime of a token
 * stolen by a later XSS/extension issue. Mobile uses SecureStore separately.
 */
function webStorage(): Storage {
  if (typeof window === 'undefined') {
    throw new Error('Web storage is unavailable during SSR');
  }
  return import.meta.env.PROD ? window.sessionStorage : window.localStorage;
}

function removeLegacyPersistentTokens(): void {
  if (typeof window === 'undefined' || !import.meta.env.PROD) return;
  for (const key of [TOKEN_KEY, REFRESH_KEY, SESSION_KEY]) {
    window.localStorage.removeItem(key);
  }
}

export interface SessionUser {
  id: string;
  tenantId: string;
  employeeCode: string;
  fullName: string;
  email: string;
  role: string;
  zone?: string | null;
  phoneNumber?: string | null;
}

export function getToken(): string | null {
  removeLegacyPersistentTokens();
  return webStorage().getItem(TOKEN_KEY);
}
export function setTokens(access: string, refresh: string): void {
  removeLegacyPersistentTokens();
  webStorage().setItem(TOKEN_KEY, access);
  webStorage().setItem(REFRESH_KEY, refresh);
}
export function getRefreshToken(): string | null {
  return webStorage().getItem(REFRESH_KEY);
}
export function saveSession(user: SessionUser): void {
  removeLegacyPersistentTokens();
  webStorage().setItem(SESSION_KEY, JSON.stringify(user));
}
export function loadSession(): SessionUser | null {
  try {
    const raw = webStorage().getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}
export function clearSession(): void {
  if (typeof window !== 'undefined') {
    const storage = webStorage();
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(REFRESH_KEY);
    storage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(SESSION_KEY);
  }
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  retried?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = opts;
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${resolveApiBase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError("NETWORK_ERROR", "تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت.", 0);
  }

  // 401 → attempt one refresh then retry once.
  // Never retry the refresh endpoint itself (avoids infinite recursion).
  if (
    res.status === 401 &&
    token &&
    !opts.retried &&
    !path.includes("/auth/refresh")
  ) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, { ...opts, retried: true });
  }

  let json: any = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (!res.ok || json.success === false) {
    throw new ApiError(
      json.errorCode || "API_ERROR",
      json.message || `Request failed (${res.status})`,
      res.status
    );
  }
  return json.data as T;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    // Raw fetch (not `request`) so a 401 here cannot re-enter the refresh logic.
    const res = await fetch(`${resolveApiBase()}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.data?.accessToken) {
      clearSession();
      return false;
    }
    setTokens(json.data.accessToken, json.data.refreshToken);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "POST", body });
  },
  put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PUT", body });
  },
  patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, { method: "PATCH", body });
  },
  del<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
