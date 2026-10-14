/**
 * Firebase Anonymous Auth over REST — keeps native app working after
 * Firestore rules start enforcing `request.auth != null`.
 * Graceful: returns empty headers if anonymous provider isn't enabled yet,
 * so the app keeps working against permissive rules too.
 */

const FIREBASE_API_KEY = "AIzaSyBbK2e2saN8Olu7O6vjHP23MkTsUgyN2iE";

let idToken: string | null = null;
let refreshToken: string | null = null;
let expiresAt = 0;
let inflight: Promise<void> | null = null;

async function signUpAnonymous(): Promise<void> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnSecureToken: true }),
    }
  );
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || !json.idToken) {
    const code = json?.error?.message || "";
    if (/OPERATION_NOT_ALLOWED|ADMIN_ONLY_OPERATION|PROJECT_NOT_FOUND/.test(code)) {
      throw new Error(`ANON_DISABLED:${code}`);
    }
    throw new Error(`SIGNUP_FAILED:${code || res.status}`);
  }
  idToken = json.idToken;
  refreshToken = json.refreshToken ?? null;
  expiresAt = Date.now() + (Number(json.expiresIn) || 3600) * 1000 - 60_000;
}

async function refreshWithToken(): Promise<void> {
  if (!refreshToken) throw new Error("NO_REFRESH");
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }),
    }
  );
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || !json.id_token) throw new Error(`REFRESH_FAILED:${json?.error?.message || res.status}`);
  idToken = json.id_token;
  refreshToken = json.refresh_token ?? refreshToken;
  expiresAt = Date.now() + (Number(json.expires_in) || 3600) * 1000 - 60_000;
}

/** Anonymous Firebase access backs the tree-account fallback (same as Android production). Disable only when the ERP backend is live: EXPO_PUBLIC_DISABLE_ANONYMOUS_FIREBASE=true. */
function anonymousAccessAllowed(): boolean {
  return process.env.EXPO_PUBLIC_DISABLE_ANONYMOUS_FIREBASE !== 'true';
}

/** Ensure a valid Firebase ID token; production must use server-issued auth. */
export async function ensureAuth(): Promise<void> {
  if (!anonymousAccessAllowed()) {
    throw new Error('ANONYMOUS_FIREBASE_DISABLED');
  }
  if (idToken && Date.now() < expiresAt) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      if (refreshToken) {
        try { await refreshWithToken(); return; } catch { /* fall through to signup */ }
      }
      await signUpAnonymous();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Headers for Firestore REST calls; empty object keeps legacy permissive-rules flow. */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    await ensureAuth();
    return idToken ? { Authorization: `Bearer ${idToken}` } : {};
  } catch {
    return {};
  }
}
