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

export const TOKEN_KEY = "fimto_access_token";
export const REFRESH_KEY = "fimto_refresh_token";
export const SESSION_KEY = "fimto_user_session";

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
  return localStorage.getItem(TOKEN_KEY);
}
export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}
export function saveSession(user: SessionUser): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}
export function loadSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}
export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(SESSION_KEY);
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
    res = await fetch(`${API_BASE}${path}`, {
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
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
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
