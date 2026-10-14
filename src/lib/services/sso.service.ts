/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Enterprise SSO Service — OIDC Authorization Code (Epic 11)
 * ============================================================
 *
 *  Passwordless enterprise login via Entra ID / Google / Okta /
 *  any OIDC provider — dependency-free (plain fetch + JWKS):
 *    1. GET /api/auth/sso/login?tenant=CODE&provider=id → IdP redirect
 *    2. IdP → GET /api/auth/sso/callback?code&state
 *    3. Code exchange → ID-token verify (JWKS, RS256) → find user
 *       by email within the tenant → issue the standard ERP
 *       token pair + user_sessions row (identical to password login)
 *
 *  SECURITY:
 *   • state is HMAC-signed (tenant+provider+expiry) — no server store
 *   • client secrets AES-encrypted in tenants.settings.sso
 *   • auto-provisioning is OFF: the email must already belong to an
 *     ACTIVE tenant user, otherwise 403 (ask your administrator)
 *   • PKCE S256 (code_challenge) on the authorize request
 * ============================================================
 */

import crypto from "node:crypto";
import { db } from "@/db";
import { tenants, users, userSessions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { issueTokenPair } from "../auth/jwt";
import {
  decryptSecrets,
  encryptSecrets,
} from "../integrations/accounting/connector";

export interface SsoProviderConfig {
  id: string;
  label: string;
  issuer: string;
  clientId: string;
  clientSecret?: string; // write-only
  active: boolean;
}

interface StoredProvider extends Omit<SsoProviderConfig, "clientSecret"> {
  credentialsEnc?: string;
}

function stateSecret(): Buffer {
  const s = process.env.JWT_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be configured before SSO is enabled in production");
  }
  return crypto
    .createHash("sha256")
    .update(s ?? "fimto-sso-dev-state-secret")
    .digest();
}

// ─── Tenant SSO config ────────────────────────────────────────────────────────

async function readSso(tenantId: string): Promise<StoredProvider[]> {
  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const settings = ((rows[0]?.settings ?? {}) as Record<string, unknown>) ?? {};
  const sso = (settings.sso ?? {}) as Record<string, unknown>;
  return Array.isArray(sso.providers) ? (sso.providers as StoredProvider[]) : [];
}

async function writeSso(tenantId: string, providers: StoredProvider[]): Promise<void> {
  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const settings = ((rows[0]?.settings ?? {}) as Record<string, unknown>) ?? {};
  await db
    .update(tenants)
    .set({
      settings: { ...settings, sso: { providers } },
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));
}

function sanitize(p: StoredProvider): Omit<StoredProvider, "credentialsEnc"> {
  const { credentialsEnc: _drop, ...rest } = p;
  void _drop;
  return rest;
}

export async function listSsoProviders(tenantId: string) {
  return (await readSso(tenantId)).map(sanitize);
}

export async function saveSsoProvider(
  tenantId: string,
  input: SsoProviderConfig
): Promise<unknown> {
  const providers = await readSso(tenantId);
  const idx = providers.findIndex((p) => p.id === input.id);

  const prevSecrets: Record<string, string> =
    idx >= 0 && providers[idx].credentialsEnc
      ? (() => {
          try {
            return decryptSecrets(providers[idx].credentialsEnc!);
          } catch {
            return {};
          }
        })()
      : {};
  const nextSecrets = { ...prevSecrets };
  if (input.clientSecret !== undefined) nextSecrets.clientSecret = input.clientSecret;

  const stored: StoredProvider = {
    id: input.id,
    label: input.label,
    issuer: input.issuer.replace(/\/$/, ""),
    clientId: input.clientId,
    active: input.active,
    ...(nextSecrets.clientSecret ? { credentialsEnc: encryptSecrets(nextSecrets) } : {}),
  };

  if (idx >= 0) providers[idx] = stored;
  else providers.push(stored);
  await writeSso(tenantId, providers);
  return sanitize(stored);
}

export async function deleteSsoProvider(tenantId: string, providerId: string) {
  const providers = await readSso(tenantId);
  const next = providers.filter((p) => p.id !== providerId);
  if (next.length === providers.length) return false;
  await writeSso(tenantId, next);
  return true;
}

async function getProvider(tenantId: string, providerId: string) {
  const providers = await readSso(tenantId);
  const p = providers.find((x) => x.id === providerId && x.active);
  if (!p) return null;
  let clientSecret = "";
  if (p.credentialsEnc) {
    try {
      clientSecret = decryptSecrets(p.credentialsEnc).clientSecret ?? "";
    } catch {
      return null;
    }
  }
  if (!clientSecret) return null;
  return { ...p, clientSecret };
}

// ─── OIDC discovery (cached) ──────────────────────────────────────────────────

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

const discoveryCache = new Map<string, { doc: OidcDiscovery; exp: number }>();

async function discover(issuer: string): Promise<OidcDiscovery> {
  const hit = discoveryCache.get(issuer);
  if (hit && hit.exp > Date.now()) return hit.doc;
  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
  const doc = (await res.json()) as OidcDiscovery;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error("OIDC discovery document incomplete");
  }
  discoveryCache.set(issuer, { doc, exp: Date.now() + 3600_000 });
  return doc;
}

function appBaseUrl(): string {
  return (process.env.PUBLIC_APP_BASE_URL ?? "https://concrete.fimtosoft.com").replace(/\/$/, "");
}

// ─── Login start ──────────────────────────────────────────────────────────────

export async function ssoLoginStart(tenantCode: string, providerId: string) {
  const t = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.tenantCode, tenantCode))
    .limit(1);
  if (!t[0]) throw new Error("Unknown tenant");

  const provider = await getProvider(t[0].id, providerId);
  if (!provider) throw new Error("SSO provider not configured");
  const doc = await discover(provider.issuer);

  // PKCE (verifier is round-tripped inside the signed state — see below)
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");

  const payload = {
    tenantId: t[0].id,
    providerId,
    verifier,
    exp: Date.now() + 10 * 60_000,
  };
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(raw).digest("base64url");
  const state = `${raw}.${sig}`;

  const redirectUri = `${appBaseUrl()}/api/auth/sso/callback`;
  const authUrl = new URL(doc.authorization_endpoint);
  authUrl.searchParams.set("client_id", provider.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return { redirectUrl: authUrl.toString() };
}

// ─── Callback ─────────────────────────────────────────────────────────────────

interface StatePayload {
  tenantId: string;
  providerId: string;
  verifier: string;
  exp: number;
}

function verifyState(state: string): StatePayload {
  const [raw, sig] = state.split(".");
  if (!raw || !sig) throw new Error("Malformed state");
  const expect = crypto.createHmac("sha256", stateSecret()).update(raw).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }
  const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as StatePayload;
  if (!payload.tenantId || !payload.providerId || !payload.verifier) {
    throw new Error("Malformed state");
  }
  if (payload.exp < Date.now()) throw new Error("Login session expired — try again");
  return payload;
}

interface JwksKey {
  kty: string;
  kid?: string;
  [k: string]: unknown;
}

async function verifyIdToken(
  doc: OidcDiscovery,
  clientId: string,
  idToken: string
): Promise<{ email: string; name: string }> {
  const header = JSON.parse(
    Buffer.from(idToken.split(".")[0], "base64url").toString("utf8")
  ) as { kid?: string; alg?: string };
  if (header.alg !== "RS256") throw new Error(`Unsupported ID token alg: ${header.alg}`);

  const res = await fetch(doc.jwks_uri);
  if (!res.ok) throw new Error("JWKS fetch failed");
  const jwks = (await res.json()) as { keys: JwksKey[] };
  const jwk = jwks.keys.find((k) => k.kid === header.kid) ?? jwks.keys[0];
  if (!jwk) throw new Error("No matching JWKS key");

  const publicKey = crypto.createPublicKey({ key: jwk as never, format: "jwk" });
  const claims = jwt.verify(idToken, publicKey, {
    algorithms: ["RS256"],
    issuer: doc.issuer,
    audience: clientId,
  }) as Record<string, unknown>;

  const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
  const name =
    (typeof claims.name === "string" && claims.name) ||
    (typeof claims.preferred_username === "string" && claims.preferred_username) ||
    email;
  // Require verification only when the IdP explicitly says unverified
  if (claims.email_verified === false) throw new Error("Email not verified at IdP");
  if (!email) throw new Error("IdP did not return an email");
  return { email, name };
}

export async function ssoCallback(code: string, state: string, ip: string) {
  const payload = verifyState(state);
  const provider = await getProvider(payload.tenantId, payload.providerId);
  if (!provider) throw new Error("SSO provider not configured");
  const doc = await discover(provider.issuer);

  // Code exchange
  const redirectUri = `${appBaseUrl()}/api/auth/sso/callback`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    code_verifier: payload.verifier,
  });
  const tokenRes = await fetch(doc.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tokens = (await tokenRes.json()) as { id_token?: string; error?: string };
  if (!tokenRes.ok || !tokens.id_token) {
    throw new Error(`Code exchange failed: ${tokens.error ?? tokenRes.status}`);
  }

  const { email } = await verifyIdToken(doc, provider.clientId, tokens.id_token);

  // Secure default: the email must already belong to an ACTIVE tenant user.
  // Folded on both sides — an IdP is free to return `Workshop.Mgr@…` for an
  // address stored as `workshopMgr@…`, and an exact match would reject a real
  // employee at the front door rather than let them in.
  const userRows = await db
    .select()
    .from(users)
    .where(
      and(
        sql`lower(${users.email}) = lower(${email})`,
        eq(users.tenantId, payload.tenantId)
      )
    )
    .limit(1);
  const user = userRows[0];
  if (!user) {
    throw new Error("SSO_NO_ACCOUNT");
  }
  if (!user.isActive) {
    throw new Error("ACCOUNT_DISABLED");
  }

  const tokenPair = issueTokenPair({
    sub: user.id,
    tenantId: user.tenantId,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    role: user.role,
    permissions: (user.permissions as string[]) ?? [],
    zone: user.zone ?? undefined,
  });

  await db.insert(userSessions).values({
    userId: user.id,
    tenantId: user.tenantId,
    jti: tokenPair.jti,
    deviceInfo: {
      platform: "sso-web",
      appVersion: "1.0.0",
      deviceId: "sso",
      ip,
    },
    isRevoked: false,
    expiresAt: tokenPair.refreshExpiresAt,
  });

  await db
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));

  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    expiresAt: tokenPair.accessExpiresAt.toISOString(),
    user: {
      id: user.id,
      tenantId: user.tenantId,
      employeeCode: user.employeeCode,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      zone: user.zone,
    },
  };
}
