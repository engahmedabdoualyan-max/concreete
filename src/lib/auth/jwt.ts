/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  JWT Utilities — Token issuance, verification & rotation
 * ============================================================
 *
 *  Strategy:
 *  • Access tokens  — short-lived (15 min), signed with HS256
 *  • Refresh tokens — longer-lived (7 days), stored as hash in DB
 *  • JTI claim      — unique per token, checked against user_sessions
 *    for forced-logout support
 * ============================================================
 */

import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import type { UserRole } from "@/db/schema";

// ─── Environment Guard ────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";
const devAccessFallback = "fimto-erp-dev-secret-change-in-prod";
const devRefreshFallback = "fimto-erp-refresh-dev-secret-change-in-prod";

function resolveSecret(envName: string, devFallback: string): string {
  const value = process.env[envName];
  if (value) return value;
  if (isProduction) {
    // Never run a deployed server with a hardcoded, publicly-known secret —
    // anyone could forge tokens. Fail loudly instead.
    throw new Error(
      `[JWT] Missing required environment variable ${envName} in production. ` +
        `Set it in your deployment config (Vercel → Settings → Environment Variables).`
    );
  }
  console.warn(
    `[JWT] ${envName} not set — using DEV fallback. Set ${envName} before deploying.`
  );
  return devFallback;
}

const JWT_SECRET = resolveSecret("JWT_SECRET", devAccessFallback);
const JWT_REFRESH_SECRET = resolveSecret("JWT_REFRESH_SECRET", devRefreshFallback);
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface TokenPayload {
  /** User UUID */
  sub: string;
  /** Tenant UUID — mandatory SaaS isolation boundary */
  tenantId: string;
  /** Employee code (human-readable identifier) */
  employeeCode: string;
  /** Full display name */
  fullName: string;
  /** Assigned role — drives RBAC */
  role: UserRole;
  /** Granular permission overrides */
  permissions: string[];
  /** Geographic zone (for sales reps & drivers) */
  zone?: string;
  /** JWT ID — links to user_sessions row for revocation */
  jti: string;
  /** Token type discriminator */
  tokenType: "ACCESS" | "REFRESH";
}

export interface IssuedTokenPair {
  accessToken: string;
  refreshToken: string;
  /** JTI shared by both tokens in a pair */
  jti: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

// ─── Token Issuance ───────────────────────────────────────────────────────────

/**
 * Issues a new access + refresh token pair for an authenticated user.
 * The JTI is generated fresh and must be persisted in `user_sessions`.
 */
export function issueTokenPair(
  user: Omit<TokenPayload, "jti" | "tokenType">
): IssuedTokenPair {
  const jti = crypto.randomUUID();
  const now = Date.now();

  const basePayload = { ...user, jti };

  const accessToken = jwt.sign(
    { ...basePayload, tokenType: "ACCESS" } satisfies TokenPayload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY, algorithm: "HS256" } as SignOptions
  );

  const refreshToken = jwt.sign(
    { ...basePayload, tokenType: "REFRESH" } satisfies TokenPayload,
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY, algorithm: "HS256" } as SignOptions
  );

  return {
    accessToken,
    refreshToken,
    jti,
    accessExpiresAt: new Date(now + 15 * 60 * 1000),
    refreshExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
  };
}

// ─── Token Verification ───────────────────────────────────────────────────────

/**
 * Verifies an access token and returns the decoded payload.
 * Throws a typed error for specific failure modes so middleware
 * can return the correct HTTP status and error code.
 */
export function verifyAccessToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload & TokenPayload;

    if (decoded.tokenType !== "ACCESS") {
      throw new AuthError("WRONG_TOKEN_TYPE", "Refresh token presented as access token");
    }

    return decoded;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError("TOKEN_EXPIRED", "Access token has expired");
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AuthError("TOKEN_INVALID", "Access token signature is invalid");
    }
    throw new AuthError("TOKEN_INVALID", "Unknown token verification failure");
  }
}

/**
 * Verifies a refresh token. Used only by the /auth/refresh endpoint.
 */
export function verifyRefreshToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload & TokenPayload;

    if (decoded.tokenType !== "REFRESH") {
      throw new AuthError("WRONG_TOKEN_TYPE", "Access token presented as refresh token");
    }

    return decoded;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AuthError("TOKEN_EXPIRED", "Refresh token has expired — please log in again");
    }
    throw new AuthError("TOKEN_INVALID", "Refresh token is invalid");
  }
}

// ─── Hashing Utilities ────────────────────────────────────────────────────────

/**
 * SHA-256 hashes a refresh token for safe DB storage.
 * Never store raw tokens in the database.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Extracts the Bearer token from an Authorization header.
 * Returns null if the header is absent or malformed.
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

// ─── Typed Auth Error ─────────────────────────────────────────────────────────

export type AuthErrorCode =
  | "TOKEN_MISSING"
  | "TOKEN_INVALID"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "WRONG_TOKEN_TYPE"
  | "INSUFFICIENT_ROLE"
  | "INSUFFICIENT_PERMISSION"
  | "ACCOUNT_DISABLED";

export class AuthError extends Error {
  public readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}
